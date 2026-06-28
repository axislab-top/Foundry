import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import {
  AGENT_MENTION_HANDLED_ROUTING_KEY,
  COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
  EMPLOYEE_TASK_PROPOSE_ROUTING_KEY,
} from '@contracts/events';
import { HierarchicalHeartbeatDynamicSubGraphRegistry, type CeoSupervisorState } from '@service/ai';
import { MessagingService } from '@service/messaging';
import { metrics } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AgentExecutionService } from './services/agent-execution.service.js';
import { DirectorAutonomousService } from '../collaboration/director/director-autonomous.service.js';
import { L1FeatureFlagService } from '../collaboration/l1/l1-feature-flag.service.js';
import type { AutonomousIntentRoute, AutonomousRouterInput } from '../collaboration/router/autonomous-intent-route.util.js';
import { resolveEmployeeAutonomousRoute } from '../collaboration/router/autonomous-intent-route.util.js';
import type { RoomContext } from '../collaboration/contracts/collaboration-2026.contracts.js';
import {
  CROSS_DEPARTMENT_COORDINATION_COMPLETED_RK,
  CROSS_DEPARTMENT_COORDINATION_REQUESTED_RK,
  detectCrossDepartmentCoordinationEscalation,
} from '../collaboration/cross-department/cross-department-coordination.utils.js';
import { phase2CrossDeptCoordinationCounter } from '../../common/monitoring/phase2-collaboration.metrics.js';
import { memoryReferencesFromSearchHits } from '../collaboration/utils/memory-references-from-hits.util.js';
import { CollaborationDeptReportService } from '../collaboration/dept-report/collaboration-dept-report.service.js';

type AgentRow = {
  id?: string;
  role?: string;
  organizationNodeId?: string | null;
  status?: string;
};

/**
 * W10：员工 Agent 自主 — 任务/自定义房内 agent 发言、@ 协同、子任务提议/委派、轻量子图并行、Skill + 结构化汇报。
 *
 * 门控：`EMPLOYEE_AUTONOMOUS_ENABLED` + `MULTI_AGENT_GRAPH_V2_ENABLED` + {@link L1FeatureFlagService.isEmployeeAutonomousGraphBundleEffective}。
 */
@Injectable()
export class EmployeeAutonomousService {
  private readonly logger = new Logger(EmployeeAutonomousService.name);
  private readonly meter = metrics.getMeter('foundry.employee_autonomous');
  private readonly proposeCounter = this.meter.createCounter('foundry.employee_autonomous.propose_events');
  private readonly delegationCounter = this.meter.createCounter('foundry.employee_autonomous.delegation_events');

  constructor(
    private readonly config: ConfigService,
    private readonly l1Flags: L1FeatureFlagService,
    private readonly messaging: MessagingService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly agentExecution: AgentExecutionService,
    private readonly directorAutonomous: DirectorAutonomousService,
    private readonly deptReports: CollaborationDeptReportService,
    @Optional() private readonly hierarchicalSubGraphRegistry?: HierarchicalHeartbeatDynamicSubGraphRegistry,
  ) {}

  async tryHandleAgentCollaborationMessage(params: {
    companyId: string;
    roomId: string;
    messageId: string;
    threadId?: string | null;
    contentText: string;
    senderAgentId: string;
    roomContext: RoomContext;
    mentionedAgentIds?: string[];
    /** W11：跨部门 @ 组织节点 */
    mentionedNodeIds?: string[];
    clientFeatureFlags?: string[];
  }): Promise<{ handled: boolean; reason?: string }> {
    if (!this.config.isEmployeeAutonomousEnabled() || !this.config.isMultiAgentGraphV2Enabled()) {
      return { handled: false, reason: 'global_gates_off' };
    }
    const bundleOk = await this.l1Flags.isEmployeeAutonomousGraphBundleEffective(
      params.companyId,
      params.clientFeatureFlags,
    );
    if (!bundleOk) {
      return { handled: false, reason: 'company_bundle_off' };
    }

    const rt = params.roomContext.roomType;
    if (rt !== 'task' && rt !== 'custom' && rt !== 'department') {
      return { handled: false, reason: 'room_type_skipped' };
    }

    const actorId = String(params.senderAgentId ?? '').trim();
    if (!actorId) {
      return { handled: false, reason: 'no_sender' };
    }

    const mentions = (params.mentionedAgentIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)
      .slice(0, 12);
    const others = mentions.filter((id) => id !== actorId);
    const mentionedNodes = (params.mentionedNodeIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)
      .slice(0, 12);

    const routerInput: AutonomousRouterInput = {
      companyId: params.companyId,
      roomId: params.roomId,
      messageId: params.messageId,
      contentText: params.contentText,
      threadId: params.threadId ?? null,
      mentionedAgentIds: mentions,
      mentionedNodeIds: mentionedNodes,
      ceoAgentId: actorId,
      humanSenderId: null,
      clientFeatureFlags: params.clientFeatureFlags ?? [],
    };

    const route = this.resolveRoute(routerInput);

    const directorInRoom = await this.resolveDirectorAgentIdInRoom({
      companyId: params.companyId,
      roomContext: params.roomContext,
    });

    const subgraphTargets = this.resolveDynamicSubGraphTargets({
      actorAgentId: actorId,
      mentionedAgentIds: mentions,
      directorAgentIdInRoom: directorInRoom,
      routePath: route.path,
    });

    let parallelOut: Array<Partial<CeoSupervisorState> | null> = [];
    if (subgraphTargets.length > 0 && this.hierarchicalSubGraphRegistry) {
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
          goalPreview: params.contentText.slice(0, 800),
          roomId: params.roomId,
          actorAgentId: actorId,
          predictivePath: route.path,
          mentionedAgentIds: mentions,
          subgraphTargets,
          memoryReferences,
        }),
        hierarchicalMetaJson: '{}',
        planResultJson: '{}',
        createdTaskIdsJson: '[]',
        persistErrorsJson: '[]',
        llmMetaJson: '{}',
        skipPlanReason: '',
        mainRoomId: '',
        ceoAgentId: actorId,
        reportDraft: '',
        earlyExitJson: '{}',
      };
      parallelOut = await this.hierarchicalSubGraphRegistry.invokeStandaloneSubGraphsParallel(
        subgraphTargets,
        baseState,
      );
    }

    const delegationWorthy =
      others.length > 0 ||
      route.path === 'director' ||
      route.path === 'heavy' ||
      route.path === 'graph';

    /** 无同伴 @ 时仍可发 propose；路由对「提议」类正文会标成 graph，不能与 delegationWorthy 互斥死。 */
    const proposeWorthy =
      others.length === 0 &&
      /子任务|提议|propose|task\b/i.test(params.contentText) &&
      (route.path === 'quick' || route.path === 'autonomous' || route.path === 'graph');

    const handledSurfaces: Array<
      'employee_autonomous_propose' | 'employee_autonomous_delegation' | 'employee_autonomous_skill'
    > = [];

    if (delegationWorthy && others.length > 0) {
      let idx = 0;
      for (const targetId of others.slice(0, 4)) {
        const ok = await this.publishDelegation(params, route, actorId, targetId, idx++);
        if (ok) handledSurfaces.push('employee_autonomous_delegation');
      }

      const dirMention = directorInRoom && others.includes(directorInRoom);
      if (dirMention) {
        await this.directorAutonomous.tryAcknowledgeEmployeeCollaboration({
          companyId: params.companyId,
          roomId: params.roomId,
          directorAgentId: directorInRoom,
          fromEmployeeAgentId: actorId,
          messageId: params.messageId,
          threadId: params.threadId ?? null,
          contentPreview: params.contentText,
          clientFeatureFlags: params.clientFeatureFlags,
        });
      }
    } else if (proposeWorthy) {
      const published = await this.publishPropose(params, route, actorId, mentions, subgraphTargets);
      if (published) {
        handledSurfaces.push('employee_autonomous_propose');
        this.proposeCounter.add(1, { surface: rt });
      }
    }

    let skillSummary: string | null = null;
    try {
      const exec = await this.agentExecution.executeSkillEmployeeAutonomous({
        companyId: params.companyId,
        agentId: actorId,
        skillName: 'echo',
        args: {
          message: [`[员工自主 W10]`, params.contentText].join('\n').slice(0, 4000),
        },
        traceId: params.messageId,
      });
      skillSummary = this.previewSkillResult(exec.result).slice(0, 1200);
      handledSurfaces.push('employee_autonomous_skill');
    } catch (e: unknown) {
      this.logger.warn('employee_autonomous.skill_echo_failed', {
        companyId: params.companyId,
        message: e instanceof Error ? e.message : String(e),
      });
    }

    const crossL2 = await this.maybeRunCrossDepartmentL2Coordination(params, route, mentions, mentionedNodes);

    const reportPayload = {
      version: 1 as const,
      route: { path: route.path, confidence: route.confidence },
      subgraphTargets,
      parallelGraphMeta: parallelOut.map((o) => o?.hierarchicalMetaJson ?? null),
      skillSummary,
      employeeInitiated: true,
      crossDepartmentL2: crossL2.ran ? { traceId: crossL2.traceId } : null,
    };

    try {
      await this.rpc('collaboration.messages.appendAgent', {
        companyId: params.companyId,
        actor: this.workerActor(),
        roomId: params.roomId,
        agentId: actorId,
        content: [
          `[员工自主 W10] 路由=${route.path}（${route.confidence.toFixed(2)}）`,
          subgraphTargets.length ? `动态子图: ${subgraphTargets.join(', ')}` : '',
          skillSummary ? `Skill 摘要: ${skillSummary.slice(0, 400)}` : '',
          params.contentText.trim().slice(0, 400),
        ]
          .filter(Boolean)
          .join('\n'),
        messageType: 'text',
        threadId: params.threadId ?? undefined,
        metadata: {
          source: 'employee_autonomous_w10',
          directReplyToMessageId: params.messageId,
          routingMode: 'employee_autonomous',
          roomType: rt,
          predictivePath: route.path,
          predictiveConfidence: route.confidence,
          employeeAutonomousReport: reportPayload,
        },
      });
    } catch (e: unknown) {
      this.logger.warn('employee_autonomous.append_failed', {
        companyId: params.companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { handled: false, reason: 'append_agent_failed' };
    }

    if (handledSurfaces.length > 0) {
      await this.publishMentionHandled(params, actorId, mentions, handledSurfaces, subgraphTargets, route.path);
    }

    const deptSlug =
      String(
        (params.roomContext.orgSnapshot?.departments?.[0] as { slug?: string } | undefined)?.slug ?? '',
      ).trim() || 'department';
    try {
      await this.deptReports.publishEmployeeDeptReport({
        companyId: params.companyId,
        traceId: params.messageId,
        taskId: params.messageId,
        distributionId: params.messageId,
        department: deptSlug,
        agentId: actorId,
        directorAgentId: directorInRoom ?? undefined,
        roomId: params.roomId,
        status: skillSummary ? 'ok' : 'partial',
        summary: skillSummary || params.contentText.trim().slice(0, 500) || '员工自主回合完成',
        artifacts: skillSummary
          ? [{ type: 'skill', content: skillSummary.slice(0, 2000) }]
          : [],
        metadata: { source: 'employee_autonomous_w10', route: route.path },
      });
    } catch (e: unknown) {
      this.logger.warn('employee_autonomous.dept_report_failed', {
        companyId: params.companyId,
        message: e instanceof Error ? e.message : String(e),
      });
    }

    return { handled: true };
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

  private resolveDynamicSubGraphTargets(params: {
    actorAgentId: string;
    mentionedAgentIds: string[];
    directorAgentIdInRoom: string | null;
    routePath: string;
  }): string[] {
    const targets = new Set<string>();
    const others = params.mentionedAgentIds.filter((id) => id && id !== params.actorAgentId);
    if (others.length === 0) {
      if (params.routePath === 'graph' || params.routePath === 'heavy') {
        return ['employee_autonomous'];
      }
      return [];
    }
    for (const id of others) {
      if (params.directorAgentIdInRoom && id === params.directorAgentIdInRoom) {
        targets.add('director_autonomous');
      } else {
        targets.add('employee_autonomous');
      }
    }
    return [...targets].slice(0, 4);
  }

  private async publishPropose(
    params: {
      companyId: string;
      roomId: string;
      messageId: string;
      contentText: string;
      clientFeatureFlags?: string[];
    },
    route: AutonomousIntentRoute,
    actorId: string,
    mentions: string[],
    subgraphTargets: string[],
  ): Promise<boolean> {
    try {
      const occurredAt = new Date().toISOString();
      await this.messaging.publish(
        {
          eventId: randomUUID(),
          eventType: EMPLOYEE_TASK_PROPOSE_ROUTING_KEY,
          aggregateId: `${params.messageId}:${actorId}`,
          aggregateType: 'task',
          occurredAt,
          version: 1,
          companyId: params.companyId,
          data: {
            companyId: params.companyId,
            traceId: String(params.messageId).trim(),
            fromAgentId: actorId,
            proposedTitle: params.contentText.trim().slice(0, 200) || 'employee-autonomous-proposal',
            proposedInputs: {
              surface: 'employee_autonomous_w10',
              roomId: params.roomId,
              messageId: params.messageId,
              contentPreview: params.contentText.slice(0, 800),
              predictivePath: route.path,
            },
            roomId: params.roomId,
            requestedAt: occurredAt,
            employeeInitiated: true,
            mentionedAgentIds: mentions,
            dynamicSubGraphTargets: subgraphTargets,
            predictivePath: route.path,
          },
        },
        { routingKey: EMPLOYEE_TASK_PROPOSE_ROUTING_KEY, persistent: true },
      );
      return true;
    } catch (e: unknown) {
      this.logger.warn('employee_autonomous.propose_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  private async publishDelegation(
    params: {
      companyId: string;
      roomId: string;
      messageId: string;
      contentText: string;
      clientFeatureFlags?: string[];
    },
    route: AutonomousIntentRoute,
    fromAgentId: string,
    toAgentId: string,
    index: number,
  ): Promise<boolean> {
    try {
      const delegationTaskId = randomUUID();
      const requestedAt = new Date().toISOString();
      await this.messaging.publish(
        {
          eventId: randomUUID(),
          eventType: COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
          aggregateId: delegationTaskId,
          aggregateType: 'task',
          occurredAt: requestedAt,
          version: 1,
          companyId: params.companyId,
          data: {
            companyId: params.companyId,
            traceId: String(params.messageId).trim(),
            fromAgentId,
            toAgentId,
            employeeInitiated: true,
            sessionId: params.roomId,
            delegation: {
              taskId: delegationTaskId,
              parentTaskId: undefined,
              ownerAgentId: fromAgentId,
              executorAgentId: toAgentId,
              inputs: {
                surface: 'employee_autonomous_w10',
                roomId: params.roomId,
                messageId: params.messageId,
                contentPreview: String(params.contentText ?? '').slice(0, 800),
                predictivePath: route.path,
                predictiveConfidence: route.confidence,
                employeeInitiatedSubtask: true,
                approvalTier: 'light',
                employeeSubIndex: index,
              },
              status: 'queued',
            },
            requestedAt,
          },
        },
        { routingKey: COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY, persistent: true },
      );
      this.delegationCounter.add(1, { surface: 'employee' });
      return true;
    } catch (e: unknown) {
      this.logger.warn('employee_autonomous.delegation_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  private async publishMentionHandled(
    params: {
      companyId: string;
      roomId: string;
      messageId: string;
      clientFeatureFlags?: string[];
    },
    fromAgentId: string,
    mentionedAgentIds: string[],
    handledSurfaces: Array<
      'employee_autonomous_propose' | 'employee_autonomous_delegation' | 'employee_autonomous_skill'
    >,
    dynamicSubGraphTargets: string[],
    predictivePath: string,
  ): Promise<void> {
    try {
      const occurredAt = new Date().toISOString();
      await this.messaging.publish(
        {
          eventId: randomUUID(),
          eventType: AGENT_MENTION_HANDLED_ROUTING_KEY,
          aggregateId: params.messageId,
          aggregateType: 'chat_message',
          occurredAt,
          version: 1,
          companyId: params.companyId,
          data: {
            companyId: params.companyId,
            roomId: params.roomId,
            messageId: params.messageId,
            fromAgentId,
            mentionedAgentIds,
            handledSurfaces,
            traceId: String(params.messageId).trim(),
            occurredAt,
            dynamicSubGraphTargets,
            predictivePath,
          },
        },
        { routingKey: AGENT_MENTION_HANDLED_ROUTING_KEY, persistent: true },
      );
    } catch (e: unknown) {
      this.logger.warn('employee_autonomous.mention_handled_publish_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async maybeRunCrossDepartmentL2Coordination(
    params: {
      companyId: string;
      roomId: string;
      messageId: string;
      threadId?: string | null;
      contentText: string;
      senderAgentId: string;
      roomContext: RoomContext;
      clientFeatureFlags?: string[];
    },
    _route: AutonomousIntentRoute,
    mentions: string[],
    mentionedNodes: string[],
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
    const actorId = String(params.senderAgentId ?? '').trim();

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
            sourceSurface: 'employee_autonomous',
            mentionedNodeIds: mentionedNodes,
            mentionedAgentIds: mentions,
            targetDepartmentNodeIds: mentionedNodes.slice(0, 12),
            requestedAt,
            contentPreview: String(params.contentText ?? '').slice(0, 800),
          },
        },
        { routingKey: CROSS_DEPARTMENT_COORDINATION_REQUESTED_RK, persistent: true },
      );
      phase2CrossDeptCoordinationCounter.add(1, { surface: 'employee_autonomous' });

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
        ceoAgentId: actorId,
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
            sourceSurface: 'employee_autonomous',
            reportDraftPreview: String(l2Out?.reportDraft ?? '').slice(0, 1200),
            completedAt,
          },
        },
        { routingKey: CROSS_DEPARTMENT_COORDINATION_COMPLETED_RK, persistent: true },
      );

      return { ran: true, traceId };
    } catch (e: unknown) {
      this.logger.warn('employee_autonomous.cross_department_l2_failed', {
        companyId: params.companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return { ran: false };
    }
  }

  private async resolveDirectorAgentIdInRoom(params: {
    companyId: string;
    roomContext: RoomContext;
  }): Promise<string | null> {
    const organizationNodeId = params.roomContext.organizationNodeId;
    const roomAgentIds = new Set(
      params.roomContext.members.filter((m) => m.memberType === 'agent').map((m) => m.memberId),
    );
    const result = await this.rpc<{ items?: AgentRow[] }>('agents.findAll', {
      companyId: params.companyId,
      actor: this.workerActor(),
      role: 'director',
      status: 'active',
      page: 1,
      pageSize: 100,
    }).catch(() => ({ items: [] }));
    const items = Array.isArray(result.items) ? result.items : [];
    const byNode = items.find((row) => {
      const id = String(row?.id ?? '').trim();
      if (!id || !roomAgentIds.has(id)) return false;
      if (!organizationNodeId) return true;
      return String(row?.organizationNodeId ?? '').trim() === organizationNodeId;
    });
    return byNode?.id ? String(byNode.id).trim() : null;
  }

  private resolveRoute(input: AutonomousRouterInput): AutonomousIntentRoute {
    return resolveEmployeeAutonomousRoute(input);
  }

  private async fetchMemoryRefsForGraphSubgraph(params: { companyId: string; roomId: string; query: string }) {
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

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())),
    );
  }
}
