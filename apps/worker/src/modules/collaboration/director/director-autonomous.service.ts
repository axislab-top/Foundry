import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY } from '@contracts/events';
import { HierarchicalHeartbeatDynamicSubGraphRegistry, type CeoSupervisorState } from '@service/ai';
import { MessagingService } from '@service/messaging';
import { metrics } from '@opentelemetry/api';
import { createHash, randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import type { AutonomousIntentRoute } from '../router/autonomous-intent-route.util.js';
import { L1FeatureFlagService } from '../l1/l1-feature-flag.service.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type {
  DirectorAutonomousDelegationInput,
  DirectorAutonomousDepartmentInput,
} from './director-autonomous.types.js';
import { delegationOutlineToSubPlan, type SubtaskPlanItem } from './department-delegation-outline.util.js';
import {
  buildDepartmentRoomRoster,
} from './department-room-structural-route.util.js';
import { DepartmentRoomInteractionClassifierService } from './department-room-interaction-classifier.service.js';
import {
  CROSS_DEPARTMENT_COORDINATION_COMPLETED_RK,
  CROSS_DEPARTMENT_COORDINATION_REQUESTED_RK,
  detectCrossDepartmentCoordinationEscalation,
} from '../cross-department/cross-department-coordination.utils.js';
import { phase2CrossDeptCoordinationCounter } from '../../../common/monitoring/phase2-collaboration.metrics.js';
import { memoryReferencesFromSearchHits } from '../utils/memory-references-from-hits.util.js';
import { CollaborationDeptReportBufferService } from '../dept-report/collaboration-dept-report-buffer.service.js';
import { CollaborationDeptReportService } from '../dept-report/collaboration-dept-report.service.js';
import type { EmployeeDeptReportPayload, IntentDecision } from '@contracts/types';
import { AgentExecutionService } from '../../agents/services/agent-execution.service.js';
import { buildDepartmentOrchestrationMetadata } from './department-orchestration-run.util.js';
import { OrgContextPackService } from '../org-context-pack.service.js';
import { ResponderThinkingPublisher } from '../pipeline-v2/responder-thinking.publisher.js';
import { EmployeeExecutionService } from '../employee/employee-execution.service.js';
import type { DirectorTaskPackage } from '@contracts/types';
import { MainRoomOrchestrationPauseService } from '../orchestration/main-room-orchestration-pause.service.js';
import { deptReportHasDeliverableArtifacts } from '../deliverable/l2-deliverable-gate.util.js';
import { MainRoomDispatchCompensationService } from '../dispatch/main-room-dispatch-compensation.service.js';
import { CollaborationProgramLifecycleService } from '../program/collaboration-program-lifecycle.service.js';

/** 从 namespace + key 生成确定性 UUID（v5 风格），保证重试幂等。 */
function deterministicUuid(namespace: string, key: string): string {
  const hash = createHash('sha256').update(`${namespace}:${key}`).digest('hex');
  // Format as UUID v5 (xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

/**
 * 部门 Director 委派：`collaboration.task-delegation.requested` + LLM 回复（无正文关键�?正则拆行）�?
 *
 * 门控：`DIRECTOR_AUTONOMOUS_ENABLED` + {@link L1FeatureFlagService.isDirectorAutonomousEffective}�?
 */
@Injectable()
export class DirectorAutonomousService {
  private readonly logger = new Logger(DirectorAutonomousService.name);
  private readonly directorMeter = metrics.getMeter('foundry.director');
  private readonly tasksProposedCounter = this.directorMeter.createCounter(
    'foundry.director.autonomous.tasks_proposed',
    { description: 'Director autonomous delegation events published' },
  );

  constructor(
    private readonly config: ConfigService,
    private readonly l1Flags: L1FeatureFlagService,
    private readonly messaging: MessagingService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly deptReportBuffer: CollaborationDeptReportBufferService,
    private readonly deptReports: CollaborationDeptReportService,
    private readonly agentExecution: AgentExecutionService,
    private readonly orgContextPack: OrgContextPackService,
    private readonly departmentClassifier: DepartmentRoomInteractionClassifierService,
    private readonly responderThinking: ResponderThinkingPublisher,
    private readonly employeeExecution: EmployeeExecutionService,
    private readonly orchestrationPause: MainRoomOrchestrationPauseService,
    private readonly dispatchCompensation: MainRoomDispatchCompensationService,
    private readonly programLifecycle: CollaborationProgramLifecycleService,
    @Optional() private readonly hierarchicalSubGraphRegistry?: HierarchicalHeartbeatDynamicSubGraphRegistry,
  ) {}

  /**
   * 部门群委派：消费 LLM {@link delegationOutline}，发布委派事件并由总监 LLM 生成可见回复�?
   */
  async executeDepartmentDelegation(
    params: DirectorAutonomousDelegationInput,
  ): Promise<{ handled: boolean; directorAgentId?: string; reason?: string }> {
    if (!this.config.isDirectorAutonomousEnabled()) {
      return { handled: false, reason: 'global_director_autonomous_off' };
    }
    const companyOk = await this.l1Flags.isDirectorAutonomousEffective(
      params.companyId,
      params.clientFeatureFlags,
    );
    if (!companyOk) {
      return { handled: false, reason: 'company_director_autonomous_off' };
    }

    const roster = buildDepartmentRoomRoster(params.roomContext);
    const employeeIds = await this.resolveDepartmentEmployeeIds(
      params.companyId,
      params.roomContext,
      params.directorAgentId,
      params.messageId,
    );
    const mentions = (params.mentionedAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);

    let subPlan = delegationOutlineToSubPlan({
      outline: params.delegationOutline ?? [],
      directorAgentId: params.directorAgentId,
      roster,
      mentionedAgentIds: mentions,
      fallbackEmployeeIds: employeeIds,
    });
    if (subPlan.length === 0) {
      const clip = String(params.contentText ?? '').trim().slice(0, 240);
      if (!clip) {
        return { handled: false, reason: 'empty_delegation_outline' };
      }
      subPlan = [
        {
          title: clip,
          executorAgentId: employeeIds[0] ?? params.directorAgentId,
        },
      ];
    }

    const route: AutonomousIntentRoute = {
      path: 'director',
      confidence: Number(params.classificationConfidence ?? 0.75),
    };

    let graphOut: Partial<CeoSupervisorState> | null = null;
    const graphBundleOk =
      this.config.isMultiAgentGraphV2Enabled() &&
      (await this.l1Flags.isDirectorAutonomousGraphBundleEffective(
        params.companyId,
        params.clientFeatureFlags,
      ));
    if (graphBundleOk && this.hierarchicalSubGraphRegistry && subPlan.length > 0) {
      const tickAt = new Date().toISOString();
      const memoryReferences = await this.fetchMemoryRefsForGraphSubgraph({
        companyId: params.companyId,
        roomId: params.roomId,
        query: params.contentText,
      });
      const baseState: CeoSupervisorState = {
        companyId: params.companyId,
        tickAt,
        runKind: 'graph',
        goal: String(params.contentText ?? '').slice(0, 2000),
        rootTaskId: undefined,
        traceId: String(params.messageId).trim(),
        supervisorRunId: String(params.messageId).trim(),
        triggerSource: 'collaboration_mention',
        collaborationRoomId: params.roomId,
        triggerRef: params.messageId,
        contextBundle: JSON.stringify({
          subtasks: subPlan.map((s) => ({ title: s.title, executorAgentId: s.executorAgentId })),
          roomId: params.roomId,
          interactionMode: 'delegate_tasks',
          memoryReferences,
        }),
        hierarchicalMetaJson: '{}',
        planResultJson: '{}',
        createdTaskIdsJson: '[]',
        persistErrorsJson: '[]',
        llmMetaJson: '{}',
        skipPlanReason: '',
        mainRoomId: '',
        ceoAgentId: params.directorAgentId,
        reportDraft: '',
        earlyExitJson: '{}',
      };
      graphOut = await this.hierarchicalSubGraphRegistry.invokeStandaloneSubGraph(
        'director_autonomous',
        baseState,
      );
    }

    let delegationsPublished = 0;
    for (let i = 0; i < subPlan.length; i++) {
      const st = subPlan[i]!;
      const published = await this.publishOneDelegation(params, route, st, i, mentions);
      if (published) delegationsPublished += 1;
    }

    const crossL2 = await this.maybeRunCrossDepartmentL2Coordination(params, route, mentions);

    const reportPayload = {
      version: 3 as const,
      interactionMode: 'delegate_tasks' as const,
      confidence: route.confidence,
      explanation: String(params.classificationExplanation ?? '').slice(0, 400),
      subtasks: subPlan.map((s) => ({ title: s.title, executorAgentId: s.executorAgentId })),
      delegationsPublished,
      directorInitiated: true,
      crossDepartmentL2: crossL2.ran ? { traceId: crossL2.traceId } : null,
      graph: graphOut?.hierarchicalMetaJson
        ? (() => {
            try {
              return JSON.parse(String(graphOut.hierarchicalMetaJson)) as Record<string, unknown>;
            } catch {
              return null;
            }
          })()
        : null,
      reportDraft: graphOut?.reportDraft ?? null,
    };

    const replyText = await this.generateDirectorDelegationReplyText(params, subPlan, delegationsPublished);
    try {
      await this.rpc('collaboration.messages.appendAgent', {
        companyId: params.companyId,
        actor: this.workerActor(),
        roomId: params.roomId,
        agentId: params.directorAgentId,
        content: replyText,
        messageType: 'text',
        threadId: params.threadId ?? undefined,
        metadata: {
          source: 'department_director_delegation',
          directReplyToMessageId: params.messageId,
          routingMode: 'director_autonomous',
          roomType: 'department',
          directorAutonomousReport: reportPayload,
        },
      });
    } catch (e: unknown) {
      this.logger.warn('director_autonomous.append_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { handled: false, reason: 'append_agent_failed', directorAgentId: params.directorAgentId };
    }

    void this.upsertDepartmentOrchestrationRunBestEffort({
      companyId: params.companyId,
      roomId: params.roomId,
      sourceMessageId: params.messageId,
      status: delegationsPublished > 0 ? 'running' : 'succeeded',
      stage: 'director_autonomous',
      delegationsPublished,
      subGoalCount: subPlan.length,
    });

    return { handled: true, directorAgentId: params.directorAgentId };
  }

  private async generateDirectorDelegationReplyText(
    params: DirectorAutonomousDelegationInput,
    subPlan: SubtaskPlanItem[],
    delegationsPublished: number,
  ): Promise<string> {
    const roster = buildDepartmentRoomRoster(params.roomContext);
    const nameOf = (agentId: string) =>
      roster.find((r) => r.agentId === agentId)?.displayName?.trim() || '';
    const mentionPrefix =
      delegationsPublished > 0
        ? subPlan
            .map((s) => nameOf(s.executorAgentId))
            .filter(Boolean)
            .map((n) => `@${n}`)
            .join(' ')
        : '';
    const summaryHint =
      delegationsPublished > 0
        ? `${mentionPrefix ? `${mentionPrefix} ` : ''}请协助完成：${subPlan.map((s) => s.title).join('、')}`
        : '本回合未能发布委派，请稍后重试或调整需求。';
    const llm = await this.agentExecution
      .executeDirect({
        companyId: params.companyId,
        roomId: params.roomId,
        messageId: params.messageId,
        agentId: params.directorAgentId,
        contentText: `${String(params.contentText ?? '').trim()}\n\n[系统摘要] ${summaryHint}`,
        intentDecision: {
          traceId: String(params.messageId).trim(),
          intentType: 'unknown',
          confidence: 0.8,
          targetIds: [params.directorAgentId],
          targetMode: 'single_agent',
          classifierSource: 'llm',
          llmUsed: true,
          schemaVersion: '1.0',
          routingHints: { riskLevel: 'low', shouldExecute: false, responseMode: 'direct_reply' },
          explanation: 'department_delegation_director_reply',
          roomId: params.roomId,
          requestedBy: params.humanSenderId ?? 'human',
        } as unknown as IntentDecision,
        threadId: params.threadId ?? null,
        humanSenderId: params.humanSenderId ?? null,
        mentionedAgentIds: params.mentionedAgentIds ?? [],
        traceId: String(params.messageId).trim(),
        roomType: 'department',
      })
      .catch((err: unknown) => {
        this.logger.warn('director_autonomous.delegation_llm_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          messageId: params.messageId,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      });
    const trimmed = String(llm?.text ?? '').trim();
    if (trimmed) return trimmed;
    if (delegationsPublished > 0) {
      return summaryHint.slice(0, 4000);
    }
    return '已收到你的安排请求，但本回合未能成功发布子任务，请补充说明或稍后重试。';
  }

  /**
   * Phase 3：主�?L2 子目标下发到部门群后，无需人类 @ 即触发主管拆工与委派事件�?
   */
  async tryHandleL2GoalDispatched(params: {
    companyId: string;
    roomId: string;
    subGoalTaskId: string;
    directorAgentId: string;
    deliverable: string;
    parentGoalTaskId?: string;
    distributionPlanTaskId?: string;
    distributionId?: string;
    departmentSlug?: string;
    roomContext: RoomContext;
    clientFeatureFlags?: string[];
    mainRoomId?: string;
    mainRoomThreadId?: string | null;
    mainRoomAnchorMessageId?: string | null;
    ceoAgentId?: string | null;
    deptLabel?: string;
    taskTitle?: string;
    directorDisplayName?: string;
    /** 主群 L2 显式派发：跳�?Phase1 灰度，仅受全局 DIRECTOR_AUTONOMOUS 开关约�?*/
    bypassPhase1Rollout?: boolean;
    /** 部门 execution thread（L2 dispatch 创建） */
    executionThreadId?: string | null;
  }): Promise<{ handled: boolean; reason?: string }> {
    if (!this.config.isDirectorAutonomousEnabled()) {
      return { handled: false, reason: 'global_director_autonomous_off' };
    }
    if (!params.bypassPhase1Rollout) {
      const companyOk = await this.l1Flags.isDirectorAutonomousEffective(
        params.companyId,
        params.clientFeatureFlags,
      );
      if (!companyOk) {
        return { handled: false, reason: 'company_director_autonomous_off' };
      }
    }

    const contentText = String(params.deliverable ?? '').trim();
    if (!contentText) {
      return { handled: false, reason: 'empty_deliverable' };
    }

    const pauseGateMainRoomId = String(params.mainRoomId ?? '').trim();
    if (pauseGateMainRoomId) {
      const paused = await this.orchestrationPause.isPaused({
        companyId: params.companyId,
        roomId: pauseGateMainRoomId,
        threadId: params.mainRoomThreadId,
      });
      if (paused) {
        this.logger.log('director_autonomous.l2_skipped_orchestration_paused', {
          companyId: params.companyId,
          roomId: params.roomId,
          subGoalTaskId: params.subGoalTaskId,
          mainRoomId: pauseGateMainRoomId,
        });
        return { handled: false, reason: 'orchestration_paused' };
      }
    }

    this.responderThinking.publishBestEffort({
      companyId: params.companyId,
      roomId: params.roomId,
      sourceMessageId: params.subGoalTaskId,
      status: 'routing',
      responderAgentIds: [params.directorAgentId],
      roomType: 'department',
      traceId: params.subGoalTaskId,
    });

    const employeeIds = await this.resolveDepartmentEmployeeIds(
      params.companyId,
      params.roomContext,
      params.directorAgentId,
      params.subGoalTaskId,
    );

    const classification = await this.departmentClassifier.classify({
      companyId: params.companyId,
      roomId: params.roomId,
      messageId: params.subGoalTaskId,
      contentText,
      roomContext: params.roomContext,
      mentionedAgentIds: employeeIds,
      messageCategory: 'task_publish',
      directorAgentId: params.directorAgentId,
    });
    const roster = buildDepartmentRoomRoster(params.roomContext);
    let subPlan = delegationOutlineToSubPlan({
      outline: classification.delegationOutline,
      directorAgentId: params.directorAgentId,
      roster,
      fallbackEmployeeIds: employeeIds,
    });
    if (subPlan.length === 0) {
      if (employeeIds.length === 0) {
        subPlan = [];
      } else {
        subPlan = [
          {
            title: contentText.slice(0, 240),
            executorAgentId: employeeIds[0]!,
          },
        ];
      }
    } else if (employeeIds.length > 0) {
      subPlan = subPlan.map((st) => ({
        ...st,
        executorAgentId: employeeIds.includes(st.executorAgentId) ? st.executorAgentId : employeeIds[0]!,
      }));
    } else {
      subPlan = [];
    }
    const route: AutonomousIntentRoute = {
      path: 'director',
      confidence: classification.confidence,
    };

    let delegationsPublished = 0;
    const delegationOpts = {
      parentTaskId: params.subGoalTaskId,
      l2SubGoalTaskId: params.subGoalTaskId,
      distributionPlanTaskId: params.distributionPlanTaskId,
      distributionId: params.distributionId,
      departmentSlug: params.departmentSlug,
      parentGoalTaskId: params.parentGoalTaskId,
    };
    const executionThreadId = String(params.executionThreadId ?? '').trim() || null;
    const syntheticParams: DirectorAutonomousDepartmentInput = {
      companyId: params.companyId,
      roomId: params.roomId,
      messageId: params.subGoalTaskId,
      threadId: executionThreadId,
      contentText,
      roomContext: params.roomContext,
      mentionedAgentIds: employeeIds,
      directorAgentId: params.directorAgentId,
      clientFeatureFlags: params.clientFeatureFlags,
    };
    if (employeeIds.length === 0) {
      delegationsPublished = 0;
    } else {
      for (let i = 0; i < subPlan.length; i++) {
        const st = subPlan[i]!;
        const published = await this.publishOneDelegation(
          syntheticParams,
          route,
          st,
          i,
          employeeIds,
          delegationOpts,
        );
        if (published) delegationsPublished += 1;
      }
      const distId = String(delegationOpts.distributionId ?? params.subGoalTaskId).trim();
      const deptSlug = String(delegationOpts.departmentSlug ?? '').trim();
      if (delegationsPublished > 0 && distId && deptSlug) {
        await this.deptReportBuffer.setExpectedDelegations(distId, deptSlug, delegationsPublished);
      }
    }

    const syntheticDelegation: DirectorAutonomousDelegationInput = {
      companyId: params.companyId,
      roomId: params.roomId,
      messageId: params.subGoalTaskId,
      threadId: executionThreadId,
      contentText,
      roomContext: params.roomContext,
      mentionedAgentIds: employeeIds,
      directorAgentId: params.directorAgentId,
      clientFeatureFlags: params.clientFeatureFlags,
      delegationOutline: subPlan.map((s) => ({
        title: s.title,
        suggestedExecutorAgentId: s.executorAgentId,
      })),
      classificationConfidence: classification.confidence,
      classificationExplanation: classification.explanation,
    };
    const replyText = await this.generateDirectorDelegationReplyText(
      syntheticDelegation,
      subPlan,
      delegationsPublished,
    );

    try {
      await this.rpc('collaboration.messages.appendAgent', {
        companyId: params.companyId,
        actor: this.workerActor(),
        roomId: params.roomId,
        agentId: params.directorAgentId,
        content: replyText,
        messageType: 'text',
        threadId: executionThreadId ?? undefined,
        metadata: {
          source: 'department_director_l2_autonomous',
          directReplyToMessageId: params.subGoalTaskId,
          routingMode: 'director_autonomous_l2',
          roomType: 'department',
          l2SubGoalTaskId: params.subGoalTaskId,
          parentGoalTaskId: params.parentGoalTaskId ?? null,
          delegationsPublished,
          executionProgramStage: 'delegate',
          ...(executionThreadId ? { threadId: executionThreadId, collaborationThreadId: executionThreadId } : {}),
        },
      });
    } catch (e: unknown) {
      this.logger.warn('director_autonomous.l2_append_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { handled: false, reason: 'append_agent_failed' };
    }

    void this.upsertDepartmentOrchestrationRunBestEffort({
      companyId: params.companyId,
      roomId: params.roomId,
      sourceMessageId: params.subGoalTaskId,
      status: 'running',
      stage: 'dept_delegation',
      delegationsPublished,
      subGoalCount: subPlan.length,
    });

    if (employeeIds.length === 0) {
      void this.runDirectorInlineL2Deliverable({
        companyId: params.companyId,
        roomId: params.roomId,
        subGoalTaskId: params.subGoalTaskId,
        directorAgentId: params.directorAgentId,
        deliverable: contentText,
        departmentSlug: params.departmentSlug,
        parentGoalTaskId: params.parentGoalTaskId,
        distributionPlanTaskId: params.distributionPlanTaskId,
        distributionId: params.distributionId,
      }).catch((e: unknown) => {
        this.logger.warn('director_autonomous.l2_inline_deliverable_failed', {
          companyId: params.companyId,
          subGoalTaskId: params.subGoalTaskId,
          message: e instanceof Error ? e.message : String(e),
        });
      });
    }

    return { handled: true };
  }

  /**
   * 部门无普通员工时：由主管直接跑 Skill 产出交付物（避免委派给 director 自身后 pending 不执行）。
   */
  private async runDirectorInlineL2Deliverable(params: {
    companyId: string;
    roomId: string;
    subGoalTaskId: string;
    directorAgentId: string;
    deliverable: string;
    departmentSlug?: string;
    parentGoalTaskId?: string;
    distributionPlanTaskId?: string;
    distributionId?: string;
  }): Promise<void> {
    const department = String(params.departmentSlug ?? 'unknown').trim() || 'unknown';
    const pkg: DirectorTaskPackage = {
      taskId: params.subGoalTaskId,
      distributionId: String(params.distributionId ?? params.subGoalTaskId).trim(),
      department,
      ownerAgent: params.directorAgentId,
      objective: String(params.deliverable ?? '').trim(),
      acceptanceCriteria: [],
      priority: 'P1',
      traceId: params.subGoalTaskId,
      metadata: {
        companyId: params.companyId,
        roomId: params.roomId,
        requiresDeliverable: true,
        departmentSlug: department,
        parentGoalTaskId: params.parentGoalTaskId,
        distributionPlanTaskId: params.distributionPlanTaskId,
        distributionId: params.distributionId,
        source: 'director_l2_inline_deliverable',
      },
    };
    const result = await this.employeeExecution.executeTask(pkg);
    const artifacts = (result.artifacts ?? []).map((a) => ({
      type: String(a.type ?? 'artifact'),
      uri: typeof a.uri === 'string' ? a.uri : undefined,
      content: typeof a.content === 'string' ? a.content : undefined,
      fileAssetId: typeof a.fileAssetId === 'string' ? a.fileAssetId : undefined,
      label: typeof a.label === 'string' ? a.label : undefined,
    }));
    await this.deptReports.publishEmployeeDeptReport({
      companyId: params.companyId,
      traceId: params.subGoalTaskId,
      taskId: params.subGoalTaskId,
      parentGoalTaskId: params.parentGoalTaskId,
      distributionId: params.distributionId,
      distributionPlanTaskId: params.distributionPlanTaskId,
      department,
      agentId: params.directorAgentId,
      directorAgentId: params.directorAgentId,
      roomId: params.roomId,
      status: result.status === 'ok' ? 'ok' : 'failed',
      summary: String(result.summary ?? params.deliverable).slice(0, 4000),
      artifacts,
      metadata: { source: 'director_l2_inline_deliverable' },
    });
    await this.tryAggregateEmployeeDeptReports({
      companyId: params.companyId,
      report: {
        version: 1,
        companyId: params.companyId,
        traceId: params.subGoalTaskId,
        taskId: params.subGoalTaskId,
        parentGoalTaskId: params.parentGoalTaskId,
        distributionId: params.distributionId,
        distributionPlanTaskId: params.distributionPlanTaskId,
        department,
        agentId: params.directorAgentId,
        directorAgentId: params.directorAgentId,
        roomId: params.roomId,
        status: result.status === 'ok' ? 'ok' : 'failed',
        summary: String(result.summary ?? '').slice(0, 4000),
        artifacts,
        reportedAt: new Date().toISOString(),
      },
    });
  }

  /** W11：跨部门信号 �?出站协调事件 + standalone `l2_cross_department` invoke */
  private async maybeRunCrossDepartmentL2Coordination(
    params: DirectorAutonomousDepartmentInput,
    _route: AutonomousIntentRoute,
    mentions: string[],
  ): Promise<{ ran: boolean; traceId?: string }> {
    if (!this.config.isMultiAgentGraphV2Enabled() || !this.config.isCrossDepartmentCoordinationEnabled()) {
      return { ran: false };
    }
    if (
      !(await this.l1Flags.isCrossDepartmentCoordinationEffective(params.companyId, params.clientFeatureFlags, {
        departmentOrganizationNodeId: params.roomContext.organizationNodeId,
      }))
    ) {
      return { ran: false };
    }
    const mentionedNodes = (params.mentionedNodeIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
    if (
      !detectCrossDepartmentCoordinationEscalation({
        contentText: params.contentText,
        mentionedNodeIds: mentionedNodes,
      })
    ) {
      return { ran: false };
    }
    if (!this.hierarchicalSubGraphRegistry) {
      return { ran: false };
    }

    const traceId = String(params.messageId).trim();
    const requestedAt = new Date().toISOString();

    try {
      await this.messaging.publish(
        {
          eventId: randomUUID(),
          eventType: CROSS_DEPARTMENT_COORDINATION_REQUESTED_RK,
          aggregateId: `${traceId}:cross-dept`,
          aggregateType: 'coordination',
          occurredAt: requestedAt,
          version: 1,
          companyId: params.companyId,
          data: {
            companyId: params.companyId,
            traceId,
            roomId: params.roomId,
            messageId: params.messageId,
            sourceSurface: 'director_autonomous',
            mentionedNodeIds: mentionedNodes,
            mentionedAgentIds: mentions,
            targetDepartmentNodeIds: mentionedNodes.slice(0, 12),
            requestedAt,
            contentPreview: String(params.contentText ?? '').slice(0, 800),
          },
        },
        { routingKey: CROSS_DEPARTMENT_COORDINATION_REQUESTED_RK, persistent: true },
      );
      phase2CrossDeptCoordinationCounter.add(1, { surface: 'director_autonomous' });

      const tickAt = requestedAt;
      const memoryReferences = await this.fetchMemoryRefsForGraphSubgraph({
        companyId: params.companyId,
        roomId: params.roomId,
        query: params.contentText,
      });
      const baseState: CeoSupervisorState = {
        companyId: params.companyId,
        tickAt,
        runKind: 'graph',
        goal: String(params.contentText ?? '').slice(0, 2000),
        rootTaskId: undefined,
        traceId: `${traceId}:l2-cross`,
        supervisorRunId: `${traceId}:l2-cross`,
        triggerSource: 'collaboration_mention',
        collaborationRoomId: params.roomId,
        triggerRef: params.messageId,
        contextBundle: JSON.stringify({
          crossDepartmentSignal: true,
          contentPreview: String(params.contentText ?? '').slice(0, 800),
          targetDepartmentNodeIds: mentionedNodes,
          mentionedNodeIds: mentionedNodes,
          l2ParallelSubGraphIds: ['director_autonomous', 'employee_autonomous'],
          memoryReferences,
        }),
        hierarchicalMetaJson: '{}',
        planResultJson: '{}',
        createdTaskIdsJson: '[]',
        persistErrorsJson: '[]',
        llmMetaJson: '{}',
        skipPlanReason: '',
        mainRoomId: '',
        ceoAgentId: params.directorAgentId,
        reportDraft: '',
        earlyExitJson: '{}',
      };

      const l2Out = await this.hierarchicalSubGraphRegistry.invokeStandaloneSubGraph(
        'l2_cross_department',
        baseState,
      );

      const completedAt = new Date().toISOString();
      await this.messaging.publish(
        {
          eventId: randomUUID(),
          eventType: CROSS_DEPARTMENT_COORDINATION_COMPLETED_RK,
          aggregateId: `${traceId}:cross-dept-done`,
          aggregateType: 'coordination',
          occurredAt: completedAt,
          version: 1,
          companyId: params.companyId,
          data: {
            companyId: params.companyId,
            traceId,
            roomId: params.roomId,
            messageId: params.messageId,
            sourceSurface: 'director_autonomous',
            reportDraftPreview: String(l2Out?.reportDraft ?? '').slice(0, 1200),
            completedAt,
          },
        },
        { routingKey: CROSS_DEPARTMENT_COORDINATION_COMPLETED_RK, persistent: true },
      );

      return { ran: true, traceId };
    } catch (e: unknown) {
      this.logger.warn('director_autonomous.cross_department_l2_failed', {
        companyId: params.companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { ran: false };
    }
  }

  private async resolveDepartmentEmployeeIds(
    companyId: string,
    roomContext: RoomContext,
    directorAgentId: string,
    messageId?: string,
  ): Promise<string[]> {
    const dir = String(directorAgentId).trim();
    const traceId = String(messageId ?? '').trim() || dir;
    const fromRoster = await this.orgContextPack
      .listDepartmentEmployeeAgentIds({
        companyId,
        roomId: roomContext.roomId,
        directorAgentId: dir,
        traceId,
      })
      .catch(() => []);
    if (fromRoster.length > 0) {
      return [...new Set(fromRoster)];
    }

    const fromDirectory = (roomContext.memberDirectory ?? [])
      .filter((m) => m.memberType === 'agent')
      .filter((m) => {
        const role = String(m.roleLabel ?? '').toLowerCase();
        return role === 'employee' || role.includes('employee') || role === '员工';
      })
      .map((m) => String(m.memberId).trim())
      .filter((id) => id && id !== dir);
    if (fromDirectory.length > 0) {
      return [...new Set(fromDirectory)];
    }

    const fromMembers = (roomContext.members ?? [])
      .filter((m) => m.memberType === 'agent')
      .map((m) => String(m.memberId).trim())
      .filter((id) => id && id !== dir);
    if (fromMembers.length > 0) {
      return [...new Set(fromMembers)].slice(0, 8);
    }

    const nodeId = roomContext.organizationNodeId
      ? String(roomContext.organizationNodeId).trim()
      : '';
    if (!nodeId) return [];
    try {
      const res = await this.rpc<{ items?: Array<{ id?: string; role?: string }> }>('agents.findAll', {
        companyId,
        actor: this.workerActor(),
        organizationNodeId: nodeId,
        role: 'employee',
        status: 'active',
        page: 1,
        pageSize: 12,
      });
      return (res?.items ?? [])
        .map((a) => String(a?.id ?? '').trim())
        .filter((id) => id && id !== dir);
    } catch {
      return [];
    }
  }

  private async publishOneDelegation(
    params: DirectorAutonomousDepartmentInput,
    route: AutonomousIntentRoute,
    sub: SubtaskPlanItem,
    index: number,
    allMentions: string[],
    delegationOpts?: {
      parentTaskId?: string;
      l2SubGoalTaskId?: string;
      distributionPlanTaskId?: string;
      distributionId?: string;
      departmentSlug?: string;
      parentGoalTaskId?: string;
    },
  ): Promise<boolean> {
    try {
      const delegationTaskId = deterministicUuid('delegation', `${params.messageId}:${index}`);
      const requestedAt = new Date().toISOString();
      await this.messaging.publish(
        {
          eventId: deterministicUuid('delegation-event', `${params.messageId}:${index}`),
          eventType: COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
          aggregateId: delegationTaskId,
          aggregateType: 'task',
          occurredAt: requestedAt,
          version: 1,
          companyId: params.companyId,
          data: {
            companyId: params.companyId,
            traceId: String(params.messageId).trim(),
            fromAgentId: params.directorAgentId,
            toAgentId: sub.executorAgentId,
            directorInitiated: true,
            sessionId: params.roomId,
            delegation: {
              taskId: delegationTaskId,
              parentTaskId: delegationOpts?.parentTaskId,
              ownerAgentId: params.directorAgentId,
              executorAgentId: sub.executorAgentId,
              inputs: {
                surface: delegationOpts?.l2SubGoalTaskId
                  ? 'department_director_l2_autonomous'
                  : 'department_director_autonomous',
                roomId: params.roomId,
                ...(params.threadId ? { threadId: params.threadId } : {}),
                messageId: params.messageId,
                contentPreview: String(params.contentText ?? '').slice(0, 800),
                predictivePath: route.path,
                predictiveConfidence: route.confidence,
                mentionedAgentIds: allMentions,
                directorInitiatedSubtask: true,
                approvalTier: 'light',
                directorSubIndex: index,
                directorSubTitle: sub.title.slice(0, 240),
                ...(delegationOpts?.l2SubGoalTaskId
                  ? { l2SubGoalTaskId: delegationOpts.l2SubGoalTaskId }
                  : {}),
                ...(delegationOpts?.distributionPlanTaskId
                  ? { distributionPlanTaskId: delegationOpts.distributionPlanTaskId }
                  : {}),
                ...(delegationOpts?.distributionId
                  ? { distributionId: delegationOpts.distributionId }
                  : {}),
                ...(delegationOpts?.departmentSlug
                  ? { departmentSlug: delegationOpts.departmentSlug }
                  : {}),
                ...(delegationOpts?.parentGoalTaskId
                  ? { parentGoalTaskId: delegationOpts.parentGoalTaskId }
                  : {}),
                directorAgentId: params.directorAgentId,
              },
              status: 'queued',
            },
            requestedAt,
          },
        },
        { routingKey: COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY, persistent: true },
      );
      this.tasksProposedCounter.add(1, { surface: 'department' });
      return true;
    } catch (e: unknown) {
      this.logger.warn('director_autonomous.delegation_publish_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        message: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private upsertDepartmentOrchestrationRunBestEffort(params: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    status: string;
    stage: string;
    delegationsPublished?: number;
    subGoalCount?: number;
    errorMessage?: string | null;
  }): void {
    void this.rpc('collaboration.orchestrationRuns.workerUpsert', {
      companyId: params.companyId,
      actor: this.workerActor(),
      roomId: params.roomId,
      sourceMessageId: params.sourceMessageId,
      status: params.status,
      stage: params.stage,
      errorMessage: params.errorMessage ?? undefined,
      metadata: buildDepartmentOrchestrationMetadata({
        status: params.status,
        stage: params.stage,
        delegationsPublished: params.delegationsPublished,
        subGoalCount: params.subGoalCount,
        errorMessage: params.errorMessage,
      }),
    }).catch((e: unknown) =>
      this.logger.warn('foundry.collaboration.dept_orchestration_run.upsert_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        sourceMessageId: params.sourceMessageId,
        message: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  /** Phase 3 W13：子�?context 注入结构化记忆引用（检索路径仍�?API `memory.search` 门控 hybrid/向量）�?*/
  private async fetchMemoryRefsForGraphSubgraph(params: {
    companyId: string;
    roomId: string;
    query: string;
  }) {
    const q = String(params.query ?? '').trim().slice(0, 1200);
    if (!q) return [];
    try {
      const hits = await firstValueFrom(
        this.apiRpc
          .send<unknown[]>('memory.search', {
            companyId: params.companyId,
            actor: this.workerActor(),
            data: { query: q, roomId: params.roomId, topK: 6 },
          })
          .pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
      );
      return memoryReferencesFromSearchHits(hits ?? []);
    } catch {
      return [];
    }
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }

  /**
   * 员工 `collaboration.employee.dept-report` 后：缓冲聚合，满足条件时发布 `collaboration.director.dept-report`�?
   */
  async tryAggregateEmployeeDeptReports(params: {
    companyId: string;
    report: EmployeeDeptReportPayload;
  }): Promise<{ published: boolean }> {
    const { companyId, report } = params;
    const distributionId = String(report.distributionId ?? report.traceId).trim();
    const department = String(report.department ?? '').trim();
    if (!distributionId || !department) {
      return { published: false };
    }

    const directorAgentId =
      String(report.directorAgentId ?? '').trim() ||
      (await this.resolveDirectorForDepartment(companyId, department));
    if (!directorAgentId) {
      return { published: false };
    }

    const employeeReports = await this.deptReportBuffer.listEmployeeReports(distributionId, department);
    if (!employeeReports.length) {
      return { published: false };
    }

    const allOk = employeeReports.every((r) => r.status === 'ok' || r.status === 'partial');
    const anyFailed = employeeReports.some((r) => r.status === 'failed' || r.status === 'blocked');
    const artifacts = employeeReports.flatMap((r) => r.artifacts ?? []).slice(0, 12);
    const requireDeliverable = this.config.isCollabL2AutoCompleteRequireDeliverable();
    const hasDeliverableArtifacts = deptReportHasDeliverableArtifacts(artifacts);
    const expectedDelegations = await this.deptReportBuffer.getExpectedDelegations(distributionId, department);
    const requireAllDelegations = this.config.isCollabL2RequireAllDelegations();
    const delegationBarrierOk =
      !requireAllDelegations ||
      expectedDelegations == null ||
      employeeReports.length >= expectedDelegations;
    const readyForSupervisionBase =
      allOk &&
      !anyFailed &&
      employeeReports.length > 0 &&
      delegationBarrierOk &&
      (!requireDeliverable || hasDeliverableArtifacts);

    let summary = employeeReports.map((r) => `· ${r.summary.slice(0, 200)}`).join('\n');

    if (readyForSupervisionBase) {
      try {
        const skillOut = await this.agentExecution.executeSkill({
          companyId,
          agentId: directorAgentId,
          skillName: 'director-progress-reporter',
          args: {
            distributionId,
            department,
            employeeReportCount: employeeReports.length,
            summaries: employeeReports.map((r) => r.summary).slice(0, 8),
          },
          traceId: report.traceId,
          roles: this.workerActor().roles,
          layer: 'director',
          promptSkillMode: 'complete',
        });
        const skillText = this.previewSkillResult(skillOut.result);
        if (skillText.trim()) {
          summary = skillText.slice(0, 4000);
        }
      } catch (e: unknown) {
        this.logger.warn('director.dept_report.skill_failed', {
          companyId,
          distributionId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await this.deptReports.publishDirectorDeptReport({
      companyId,
      traceId: report.traceId,
      distributionId,
      department,
      directorAgentId,
      parentGoalTaskId: report.parentGoalTaskId,
      status: anyFailed ? 'failed' : readyForSupervisionBase ? 'ok' : 'partial',
      summary: summary.slice(0, 4000),
      readyForSupervision: readyForSupervisionBase,
      employeeReports: employeeReports.map((r) => ({
        taskId: r.taskId,
        agentId: r.agentId,
        status: r.status,
        summary: r.summary.slice(0, 500),
        artifactTypes: (r.artifacts ?? []).map((a) => a.type).slice(0, 8),
      })),
      artifacts,
      blockers: anyFailed ? ['employee_report_failed'] : undefined,
      metadata: {
        source: 'director_aggregate',
      },
    });

    if (readyForSupervisionBase && report.roomId && this.config.isCollabDeptSupervisionReportInRoomEnabled()) {
      const roomId = String(report.roomId).trim();
      const deptLabel = department;
      try {
        await this.rpc('collaboration.messages.appendAgent', {
          companyId,
          actor: this.workerActor(),
          roomId,
          agentId: directorAgentId,
          content: `【部门汇报】${summary.slice(0, 2000)}`,
          messageType: 'text',
          metadata: {
            source: 'director_dept_report_summary',
            readyForSupervision: true,
            distributionId,
            department: deptLabel,
            parentGoalTaskId: report.parentGoalTaskId ?? null,
            richCard: {
              cardType: 'report_summary',
              taskId: report.parentGoalTaskId ?? report.taskId,
              title: `${deptLabel} 部门汇报`,
              status: 'ok',
              progress: 100,
              summary: summary.slice(0, 2000),
              sourceRoomId: roomId,
            },
          },
        });
      } catch (e: unknown) {
        this.logger.warn('director.dept_report.summary_card_failed', {
          companyId,
          roomId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { published: true };
  }

  private previewSkillResult(result: unknown): string {
    try {
      if (result === null || result === undefined) return '';
      if (typeof result === 'string') return result;
      return JSON.stringify(result);
    } catch {
      return String(result);
    }
  }

  private async resolveDirectorForDepartment(
    companyId: string,
    department: string,
  ): Promise<string | null> {
    try {
      const agents = await this.rpc<Array<{ id?: string; role?: string; organizationNodeId?: string }>>(
        'agents.list',
        { companyId, actor: this.workerActor() },
      );
      const dir = (agents ?? []).find((a) => String(a.role ?? '') === 'director');
      return dir?.id ? String(dir.id) : null;
    } catch {
      return null;
    }
  }

  /**
   * W10：员�?Agent 在房�?@ Director 时，由员工自主路径触发的轻量部门主管可见回复（不替代委派事件）�?
   */
  async tryAcknowledgeEmployeeCollaboration(params: {
    companyId: string;
    roomId: string;
    directorAgentId: string;
    fromEmployeeAgentId: string;
    messageId: string;
    threadId?: string | null;
    contentPreview: string;
    clientFeatureFlags?: string[];
  }): Promise<{ notified: boolean }> {
    if (!this.config.isDirectorAutonomousEnabled()) {
      return { notified: false };
    }
    const ok = await this.l1Flags.isDirectorAutonomousEffective(
      params.companyId,
      params.clientFeatureFlags,
    );
    if (!ok) {
      return { notified: false };
    }
    if (!this.config.isCollabDeptEmployeeCollabAckChatEnabled()) {
      return { notified: false };
    }
    try {
      await this.rpc('collaboration.messages.appendAgent', {
        companyId: params.companyId,
        actor: this.workerActor(),
        roomId: params.roomId,
        agentId: params.directorAgentId,
        content: '收到，我看一下。',
        messageType: 'text',
        threadId: params.threadId ?? undefined,
        metadata: {
          source: 'director_employee_collab_w10',
          directReplyToMessageId: params.messageId,
          routingMode: 'director_employee_collaboration',
          fromEmployeeAgentId: params.fromEmployeeAgentId,
        },
      });
      return { notified: true };
    } catch {
      return { notified: false };
    }
  }
}
