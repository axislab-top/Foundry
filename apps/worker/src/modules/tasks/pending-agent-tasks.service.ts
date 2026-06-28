import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { SkillToolSnapshot } from '@contracts/events';
import { ToolRegistry } from '@service/ai';
import { randomUUID } from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AgentExecutionService } from '../agents/services/agent-execution.service.js';
import { WorkerExecutionLogService } from '../../common/observability/worker-execution-log.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { ConversationOutputSanitizerService } from '../collaboration/conversation-output-sanitizer.service.js';
import { L1FeatureFlagService } from '../collaboration/l1/l1-feature-flag.service.js';
import { MessagingService } from '@service/messaging';
import { phase2AgentAutonomousTasksCompletedCounter } from '../../common/monitoring/phase2-collaboration.metrics.js';
import {
  mapSkillResultToDeliverableArtifacts,
  toCollaborationDeliverableArtifactRows,
} from '../collaboration/utils/employee-deliverable-artifacts.util.js';
import { UnifiedDeliverableExecutorService } from '../collaboration/deliverable/unified-deliverable-executor.service.js';
import { DeliverableGateService } from '../collaboration/deliverable/deliverable-gate.service.js';
import { attachFileAssetIdsToArtifactRows } from '../file-assets/attach-file-asset-ids.util.js';
import { buildEmployeeDeliverableMessagePayload } from '../collaboration/utils/post-employee-deliverable.util.js';
import type { ExecutionProfile } from '../collaboration/utils/execution-profile.util.js';
import { FileAssetsRegistrationService } from '../file-assets/file-assets-registration.service.js';
import type { CollaborationDeliverableArtifactRow } from '../collaboration/utils/employee-deliverable-artifacts.util.js';
import {
  isMainRoomL2GoalDelegationKey,
  mergeDeliverableArtifactsForL2Parent,
} from '../collaboration/deliverable/rollup-deliverable-artifacts-to-l2.util.js';

/**
 * 心跳后消费「待执行?Agent 任务」：拉取快照 ?注入 ToolRegistry ?executeSkill ?更新任务状态? */
@Injectable()
export class PendingAgentTaskExecutionService {
  private readonly logger = new Logger(PendingAgentTaskExecutionService.name);

  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly registry: ToolRegistry,
    private readonly agentExecution: AgentExecutionService,
    private readonly executionLog: WorkerExecutionLogService,
    private readonly monitoring: MonitoringService,
    private readonly messaging: MessagingService,
    private readonly l1Flags: L1FeatureFlagService,
    private readonly fileAssetsRegistration: FileAssetsRegistrationService,
    private readonly unifiedDeliverable: UnifiedDeliverableExecutorService,
    private readonly deliverableGate: DeliverableGateService,
  ) {}

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  /**
   * 带重试的 RPC 调用（用于关键状态变更如 in_progress → completed）。
   * skill 执行成功后若 RPC 失败会导致任务永远卡在 in_progress，必须重试。
   */
  private async rpcWithRetry<T>(pattern: string, payload: Record<string, unknown>, maxAttempts: number, taskId?: string): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.rpc<T>(pattern, payload);
      } catch (e: unknown) {
        lastErr = e;
        if (attempt < maxAttempts) {
          const delayMs = Math.min(500 * Math.pow(2, attempt - 1), 4000);
          this.logger.warn('rpcWithRetry attempt failed, retrying', {
            pattern,
            attempt,
            maxAttempts,
            taskId,
            delayMs,
            message: e instanceof Error ? e.message : String(e),
          });
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw lastErr;
  }

  private async assertTemporaryAgentRoomScope(params: {
    companyId: string;
    actor: { id: string; roles: string[] };
    assigneeId: string;
    roomId: string;
  }): Promise<{ projectId: string | null }> {
    const [agent, room] = await Promise.all([
      this.rpc<{ metadata?: Record<string, unknown> | null }>('agents.findOne', {
        companyId: params.companyId,
        actor: params.actor,
        id: params.assigneeId,
      }),
      this.rpc<{ taskId?: string | null }>('collaboration.rooms.findOne', {
        companyId: params.companyId,
        actor: params.actor,
        roomId: params.roomId,
      }),
    ]);
    const meta = (agent as any)?.metadata as Record<string, unknown> | null | undefined;
    const employmentType =
      meta && typeof meta['employmentType'] === 'string' ? String(meta['employmentType']) : 'permanent';
    const boundProjectId = meta && typeof meta['projectId'] === 'string' ? String(meta['projectId']) : '';
    const projectId = typeof (room as any)?.taskId === 'string' ? String((room as any).taskId) : null;
    if (employmentType === 'temporary') {
      if (!boundProjectId) {
        throw new Error('PROJECT_SCOPE_REQUIRED: temporary agent missing bound projectId');
      }
      if (!projectId || projectId !== boundProjectId) {
        throw new Error('PROJECT_SCOPE_REQUIRED: temporary agent project mismatch');
      }
    }
    return { projectId };
  }

  /** P12：须?Runner `runner.skill.execute` + `runner.exec` token ?shell builtin */
  private isShellRunnerBuiltinSkill(skillName: string): boolean {
    return skillName === 'code-run';
  }

  /**
   * P12：`executionTokenId` 透传，或凭已?`approvalRequestId`（`actionType=runner.exec`）调?API 签发 skill 绑定令牌?min）?   */
  private async resolveRunnerShellExecutionToken(params: {
    companyId: string;
    actor: { id: string; roles: string[] };
    skillName: string;
    taskId: string;
    taskMeta: Record<string, unknown>;
    roomId: string;
    traceId: string;
  }): Promise<{ token: string | null; mintFailed: boolean }> {
    if (!this.isShellRunnerBuiltinSkill(params.skillName)) {
      return { token: null, mintFailed: false };
    }
    const m = params.taskMeta;
    const direct = typeof m.executionTokenId === 'string' ? m.executionTokenId.trim() : '';
    if (direct) {
      return { token: direct, mintFailed: false };
    }
    if (!this.config.getCeoRequireExecutionToken()) {
      return { token: null, mintFailed: false };
    }
    const approvalRequestId =
      typeof m.approvalRequestId === 'string' ? m.approvalRequestId.trim() : '';
    if (!approvalRequestId) {
      return { token: null, mintFailed: true };
    }
    try {
      const created = await this.rpc<{ executionTokenId: string }>('approval.createExecutionToken', {
        companyId: params.companyId,
        actor: params.actor,
        approvalRequestId,
        skillSlug: params.skillName,
        context: {
          taskId: params.taskId,
          traceId: params.traceId,
          roomId: params.roomId || null,
        },
      });
      const tid = created?.executionTokenId?.trim();
      if (!tid) {
        return { token: null, mintFailed: true };
      }
      return { token: tid, mintFailed: false };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('approval.createExecutionToken failed (shell skill)', {
        taskId: params.taskId,
        skillName: params.skillName,
        message: msg,
      });
      return { token: null, mintFailed: true };
    }
  }

  private isBudgetRelatedMessage(msg: string): boolean {
    const m = msg.toLowerCase();
    return (
      m.includes('budget') ||
      m.includes('budget_exhausted') ||
      m.includes('company_budget_exhausted') ||
      m.includes('agent_budget_exhausted')
    );
  }

  private async pauseTaskForBudget(params: {
    companyId: string;
    actor: { id: string; roles: string[] };
    taskId: string;
    taskMeta: Record<string, unknown>;
    reason: string;
    runId?: string;
    roomId: string;
    assigneeId: string;
    traceId: string;
    userMessage: string;
  }): Promise<void> {
    const { companyId, actor, taskId, taskMeta, reason, runId, roomId, assigneeId, traceId, userMessage } =
      params;
    try {
      await this.rpc('tasks.update', {
        companyId,
        actor,
        id: taskId,
        data: {
          status: 'paused',
          blockedReason: reason.slice(0, 2000),
          metadata: {
            ...taskMeta,
            budgetPause: {
              at: new Date().toISOString(),
              reason,
              runId: runId ?? null,
            },
          },
        },
      });
    } catch (e: unknown) {
      this.logger.warn('tasks.update paused (budget) failed', {
        taskId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    if (roomId) {
      try {
        await this.rpc('collaboration.messages.appendAgent', {
          companyId,
          actor,
          roomId,
          agentId: assigneeId,
          content: ConversationOutputSanitizerService.toVisibleLayer(userMessage),
          messageType: 'text',
          metadata: { traceId, taskId, agentId: assigneeId, roomId, kind: 'budget_pause' },
        });
      } catch (e: unknown) {
        this.logger.warn('budget pause room message failed', {
          taskId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  private async enforceBudgetApprovalGate(params: {
    companyId: string;
    actor: { id: string; roles: string[] };
    task: {
      id: string;
      title: string;
      status: string;
      assigneeId?: string | null;
      metadata?: Record<string, unknown> | null;
    };
    estimatedCost: number;
    traceId: string;
    runId?: string;
  }): Promise<boolean> {
    const { companyId, actor, task, estimatedCost, traceId, runId } = params;
    const threshold = this.config.getBudgetApprovalThreshold();
    const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
    const directorLight = taskMeta.directorInitiatedSubtask === true;
    const employeeLight = taskMeta.employeeInitiatedSubtask === true;
    const crossDeptLight = taskMeta.crossDepartmentCoordinationSubtask === true;
    if (threshold <= 0 || estimatedCost < threshold) {
      return true;
    }
    // W9/W10/W11：Director / 员工 / 跨部门协调子任务轻量路径超阈值时放宽一档；仍可通过审批 RPC 拦截极高成本。
    if ((directorLight || employeeLight || crossDeptLight) && threshold > 0 && estimatedCost < threshold * 1.5) {
      return true;
    }

    const approvalDecision = taskMeta.budgetApprovalDecision;
    const isApproved =
      typeof approvalDecision === 'string' &&
      (approvalDecision === 'approved' || approvalDecision === 'modified');
    if (isApproved) {
      return true;
    }

    const existingApprovalId =
      typeof taskMeta.budgetApprovalRequestId === 'string'
        ? taskMeta.budgetApprovalRequestId
        : undefined;
    let approvalId = existingApprovalId;
    if (!approvalId) {
      try {
        const actionType = crossDeptLight
          ? 'cross.department.joint.approval'
          : directorLight
            ? 'director.autonomous.subtask.execute'
            : employeeLight
              ? 'employee.autonomous.subtask.execute'
              : 'budget.autonomous.task.execute';
        const created = await this.rpc<{ id: string }>('approval.create', {
          companyId,
          actor,
          actionType,
          riskLevel: directorLight || employeeLight || crossDeptLight ? 'L1' : 'L2',
          context: {
            taskId: task.id,
            taskTitle: task.title.slice(0, 200),
            assigneeId: task.assigneeId ?? null,
            estimatedCost,
            threshold,
            traceId,
            runId: runId ?? null,
            directorInitiated: directorLight ? true : undefined,
            employeeInitiated: employeeLight ? true : undefined,
            crossDepartmentCoordination: crossDeptLight ? true : undefined,
          },
        });
        approvalId = created?.id;
      } catch (e: unknown) {
        this.logger.warn('approval.create for budget gate failed', {
          taskId: task.id,
          message: e instanceof Error ? e.message : String(e),
        });
        return false;
      }
    }

    try {
      await this.rpc('tasks.update', {
        companyId,
        actor,
        id: task.id,
        data: {
          status: 'review',
          blockedReason: `budget approval required (estimatedCost=${estimatedCost}, threshold=${threshold})`,
          metadata: {
            ...taskMeta,
            budgetApprovalRequestId: approvalId ?? null,
            budgetApprovalDecision: 'pending',
            budgetApprovalContext: {
              estimatedCost,
              threshold,
              requestedAt: new Date().toISOString(),
              traceId,
              runId: runId ?? null,
              crossDepartmentCoordination: crossDeptLight ? true : undefined,
            },
          },
        },
      });
    } catch (e: unknown) {
      this.logger.warn('tasks.update review for budget gate failed', {
        taskId: task.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    return false;
  }

  private async findTaskByBudgetApprovalId(params: {
    companyId: string;
    actor: { id: string; roles: string[] };
    approvalRequestId: string;
  }): Promise<
    | {
        id: string;
        title: string;
        status: string;
        requiresHumanApproval: boolean;
        metadata?: Record<string, unknown> | null;
        assigneeType?: string;
        assigneeId?: string | null;
      }
    | undefined
  > {
    const statuses: Array<'pending' | 'review' | 'in_progress' | 'blocked'> = [
      'pending',
      'review',
      'in_progress',
      'blocked',
    ];
    for (const status of statuses) {
      const list = await this.rpc<{
        items: Array<{
          id: string;
          title: string;
          status: string;
          requiresHumanApproval: boolean;
          metadata?: Record<string, unknown> | null;
          assigneeType?: string;
          assigneeId?: string | null;
        }>;
      }>('tasks.findAll', {
        companyId: params.companyId,
        actor: params.actor,
        status,
        assigneeType: 'agent',
        pageSize: 50,
        page: 1,
      });
      const found = (list?.items ?? []).find((task) => {
        const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
        return taskMeta.budgetApprovalRequestId === params.approvalRequestId;
      });
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  async resumeAfterBudgetApproval(params: {
    companyId: string;
    approvalRequestId: string;
    resolvedBy?: string;
    executionTokenId?: string | null;
  }): Promise<void> {
    const actor = this.actor();
    const task = await this.findTaskByBudgetApprovalId({
      companyId: params.companyId,
      actor,
      approvalRequestId: params.approvalRequestId,
    });
    if (!task) {
      return;
    }

    const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
    if (taskMeta.budgetApprovalDecision === 'approved') {
      return;
    }

    await this.rpc('tasks.update', {
      companyId: params.companyId,
      actor,
      id: task.id,
      data: {
        status: task.status === 'blocked' ? 'pending' : task.status,
        blockedReason: '',
        metadata: {
          ...taskMeta,
          budgetApprovalDecision: 'approved',
          budgetApprovalResolvedAt: new Date().toISOString(),
          budgetApprovalResolvedBy: params.resolvedBy ?? null,
          budgetApprovalExecutionTokenId: params.executionTokenId ?? null,
        },
      },
    });
    this.monitoring.incTaskExecutionResumedAfterApproval(params.companyId);
  }

  async cancelAfterBudgetRejection(params: {
    companyId: string;
    approvalRequestId: string;
    reason?: string;
    status: 'rejected' | 'expired';
    resolvedBy?: string;
  }): Promise<void> {
    const actor = this.actor();
    const task = await this.findTaskByBudgetApprovalId({
      companyId: params.companyId,
      actor,
      approvalRequestId: params.approvalRequestId,
    });
    if (!task) {
      return;
    }
    const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
    if (taskMeta.budgetApprovalDecision === 'rejected' || taskMeta.budgetApprovalDecision === 'expired') {
      return;
    }

    await this.rpc('tasks.update', {
      companyId: params.companyId,
      actor,
      id: task.id,
      data: {
        status: 'blocked',
        blockedReason: params.reason?.slice(0, 2000) || `budget approval ${params.status}`,
        metadata: {
          ...taskMeta,
          budgetApprovalDecision: params.status,
          budgetApprovalResolvedAt: new Date().toISOString(),
          budgetApprovalResolvedBy: params.resolvedBy ?? null,
          budgetApprovalResolutionReason: params.reason ?? null,
        },
      },
    });
    this.monitoring.incTaskExecutionBlockedByApproval(
      params.status === 'expired' ? 'budget_expired' : 'budget_rejected',
    );
  }

  async processPendingForCompany(
    companyId: string,
    ceoHeartbeatRunId?: string,
  ): Promise<{ completedTaskIds: string[]; attemptedTaskIds: string[] }> {
    const actor = this.actor();
    const completedTaskIds: string[] = [];
    const attemptedTaskIds: string[] = [];
    type PendingTaskRow = {
      id: string;
      title: string;
      status: string;
      requiresHumanApproval: boolean;
      metadata?: Record<string, unknown> | null;
      assigneeType?: string;
      assigneeId?: string | null;
      parentId?: string | null;
    };

    const maxPerTick = this.config.getPendingAgentTasksMaxPerTick();
    const pageSize = 15;
    const items: PendingTaskRow[] = [];

    const fetchAllPagesForStatus = async (status: 'pending' | 'review' | 'in_progress') => {
      let page = 1;
      let totalPages = 1;
      do {
        if (items.length >= maxPerTick) return;
        const list = await this.rpc<{ items: PendingTaskRow[]; totalPages?: number }>('tasks.findAll', {
          companyId,
          actor,
          status,
          assigneeType: 'agent',
          pageSize,
          page,
        });
        for (const row of list?.items ?? []) {
          if (items.length >= maxPerTick) break;
          items.push(row);
        }
        totalPages = Number(list?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages && items.length < maxPerTick);
    };

    for (const st of ['pending', 'review', 'in_progress'] as const) {
      if (items.length >= maxPerTick) break;
      await fetchAllPagesForStatus(st);
    }

    for (const task of items) {
      if (task.assigneeType !== 'agent' || !task.assigneeId) {
        continue;
      }

      const ceoTraceId = (task.metadata as any)?.ceoTraceId;
      const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;

      // CEO gate：仅以任务 metadata 持久化决策为准（M4：不再依赖进程内 gate，避免 Worker 重启绕过）。
      const ceoApprovalDecision = taskMeta.ceoApprovalDecision;
      const directorInitiated = taskMeta.directorInitiatedSubtask === true;
      const ceoGateOk =
        typeof ceoTraceId !== 'string'
          ? true
          : directorInitiated
            ? true
          : typeof ceoApprovalDecision === 'string' &&
            (ceoApprovalDecision === 'approved' || ceoApprovalDecision === 'modified');

      if (!ceoGateOk) {
        // CEO 未放行：不做 review->in_progress 的任何操作，等待后续 tick 放行
        continue;
      }

      // Human-in-the-loop：真正的“用户审批”由 review -> in_progress/blocked 这一状态迁移表示。
      // Worker 不再自动从 review 推进执行，避免绕过用户 approval card。
      const requiresHumanApproval = !!task.requiresHumanApproval;
      if (requiresHumanApproval) {
        if (task.status === 'pending') {
          // CEO 已放行后，把 pending 推到 review，触发 approval:needed（由前端弹窗完成放行/拒绝）。
          try {
            await this.rpc('tasks.update', {
              companyId,
              actor,
              id: task.id,
              data: { status: 'review' },
            });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn('tasks pending->review failed', { taskId: task.id, msg });
          }
        }
        if (task.status === 'review') {
          // review 状态必须等待用户处理：不执行、不自动转换
          continue;
        }
        if (task.status !== 'in_progress') {
          continue;
        }
      }

      // requiresHumanApproval=false：允许直接执行（pending/review -> 自动 push in_progress?
      const traceId = `task:${task.id}:${companyId}`;
      attemptedTaskIds.push(task.id);
      const estimatedCost = this.config.getAgentSkillBudgetEstimate();
      const effectiveRunId =
        ceoHeartbeatRunId?.trim() ||
        (typeof taskMeta.runId === 'string' ? taskMeta.runId : undefined) ||
        (typeof taskMeta.ceoTraceId === 'string' ? taskMeta.ceoTraceId : undefined) ||
        undefined;
      const budgetGatePassed = await this.enforceBudgetApprovalGate({
        companyId,
        actor,
        task,
        estimatedCost,
        traceId,
        runId: effectiveRunId,
      });
      if (!budgetGatePassed) {
        continue;
      }
      const skillStartAt = Date.now();
      try {
        const skills = await this.unifiedDeliverable.hydrateAgentSkills(companyId, task.assigneeId);
        const skillName = this.pickSkillName(task, skills);
        if (!skillName) {
          this.logger.warn('pending agent task skipped: no_skill_bound', {
            taskId: task.id,
            companyId,
            assigneeId: task.assigneeId,
          });
          continue;
        }
        const args = this.buildArgs(task, skillName);
        const roomId =
          typeof (task.metadata as any)?.roomId === 'string' ? ((task.metadata as any).roomId as string) : '';
        const scope = roomId
          ? await this.assertTemporaryAgentRoomScope({
              companyId,
              actor,
              assigneeId: task.assigneeId,
              roomId,
            })
          : { projectId: null };

        const preAllowance = await this.rpc<{
          allowed: boolean;
          reason?: string;
          warning?: string;
        }>('billing.checkAllowance', {
          companyId,
          actor,
          estimatedCost,
          agentId: task.assigneeId,
          runId: effectiveRunId,
        });
        if (preAllowance?.warning) {
          this.logger.warn('agent task budget soft warning', {
            taskId: task.id,
            companyId,
            warning: preAllowance.warning,
          });
        }
        if (!preAllowance?.allowed && preAllowance?.reason === 'execution_paused') {
          const reason = preAllowance.reason;
          this.logger.warn('agent task skipped: execution paused', {
            taskId: task.id,
            companyId,
            reason,
          });
          await this.pauseTaskForBudget({
            companyId,
            actor,
            taskId: task.id,
            taskMeta,
            reason,
            runId: effectiveRunId,
            roomId,
            assigneeId: task.assigneeId,
            traceId,
            userMessage:
              '【执行暂停】平台已暂停该公司执行，任务已自动暂停。解除暂停后将任务恢复为进行中。',
          });
          continue;
        }

        // review -> in_progress（放行后 worker 执行继续）
        if (task.status !== 'in_progress') {
          await this.rpc('tasks.update', {
            companyId,
            actor,
            id: task.id,
            data: { status: 'in_progress', progress: 5 },
          });
        }

        const skillExecutionId = randomUUID();
        const shellTok = await this.resolveRunnerShellExecutionToken({
          companyId,
          actor,
          skillName,
          taskId: task.id,
          taskMeta,
          roomId,
          traceId,
        });
        if (this.isShellRunnerBuiltinSkill(skillName) && this.config.getCeoRequireExecutionToken()) {
          if (!shellTok.token) {
            const safeMsg =
              '【安全】未能获得 Runner 执行令牌：请在任务 metadata 提供 skill 绑定的 `executionTokenId`，或提供已批准且 actionType=runner.exec 的 `approvalRequestId` 以供签发。';
            this.logger.warn('agent task shell skipped: no runner.exec token', {
              taskId: task.id,
              skillName,
              mintFailed: shellTok.mintFailed,
            });
            if (effectiveRunId) {
              await this.executionLog.appendForTask(companyId, task.id, {
                stepType: 'agent.skill.skipped',
                runId: effectiveRunId,
                traceId,
                agentId: task.assigneeId,
                message: safeMsg,
                outputSnapshot: {
                  skillName,
                  reason: 'runner_exec_token_unavailable',
                  'foundry.skill_execution_id': skillExecutionId,
                  'foundry.executionTokenId': null,
                },
              });
            }
            if (roomId) {
              await this.rpc('collaboration.messages.appendAgent', {
                companyId,
                actor,
                roomId,
                agentId: task.assigneeId,
                content: ConversationOutputSanitizerService.toVisibleLayer(safeMsg),
                messageType: 'text',
                metadata: {
                  traceId,
                  taskId: task.id,
                  agentId: task.assigneeId,
                  skillName,
                  roomId,
                  kind: 'runner_token_skip',
                },
              });
            }
            await this.rpc('tasks.update', {
              companyId,
              actor,
              id: task.id,
              data: {
                status: 'paused',
                progress: 5,
                blockedReason: 'runner execution token missing',
                metadata: {
                  ...(task.metadata ?? {}),
                  autonomousExecution: {
                    traceId,
                    skillName,
                    at: new Date().toISOString(),
                    runnerExecSkipped: true,
                    reason: 'runner_exec_token_unavailable',
                    executionState: 'paused',
                  },
                },
              },
            });
            continue;
          }
        }

        if (effectiveRunId) {
          await this.executionLog.appendForTask(companyId, task.id, {
            stepType: 'agent.skill.start',
            runId: effectiveRunId,
            traceId,
            agentId: task.assigneeId,
            message: skillName,
            outputSnapshot: {
              skillName,
              argsPreview: this.safeStringify(args).slice(0, 1500),
              'foundry.skill_execution_id': skillExecutionId,
              'foundry.executionTokenId': shellTok.token ?? null,
            },
          });
        }

        if (roomId) {
          if (this.config.isCollabDeptSkillToolCallChatEnabled()) {
            const toolCallContent = `tool_call: ${skillName}\nargs: ${this.safeStringify(args).slice(0, 2000)}`;
            await this.rpc('collaboration.messages.appendAgent', {
              companyId,
              actor,
              roomId,
              agentId: task.assigneeId,
              content: ConversationOutputSanitizerService.toVisibleLayer(toolCallContent),
              messageType: 'tool_call',
              metadata: {
                traceId,
                taskId: task.id,
                agentId: task.assigneeId,
                skillName,
                roomId,
                'foundry.skill_execution_id': skillExecutionId,
                'foundry.executionTokenId': shellTok.token ?? null,
              },
            });
          }
        }

        const executionRoles = await this.unifiedDeliverable.resolveExecutionRoles(companyId, task.assigneeId);
        // P8/P10/P12：shell 经 AgentExecutionService / RunnerExecutionClient.executeSkill / runner.skill.execute（须 runner.exec token）
        const exec = await this.agentExecution.executeSkill({
          companyId,
          agentId: task.assigneeId,
          projectId: scope.projectId,
          skillName,
          args,
          traceId,
          roles: executionRoles.length ? executionRoles : actor.roles,
          executionTokenId: shellTok.token ?? undefined,
          skillExecutionId,
          promptSkillMode: 'complete',
        });

        if (effectiveRunId) {
          await this.executionLog.appendForTask(companyId, task.id, {
            stepType: 'agent.skill.complete',
            runId: effectiveRunId,
            traceId,
            agentId: task.assigneeId,
            durationMs: Date.now() - skillStartAt,
            outputSnapshot: {
              skillName,
              resultPreview: this.safeStringify(exec?.result).slice(0, 2000),
              'foundry.skill_execution_id': skillExecutionId,
              'foundry.executionTokenId': shellTok.token ?? null,
            },
          });
        }

        const mapped = mapSkillResultToDeliverableArtifacts(exec?.result, skillName);
        const projectId =
          typeof taskMeta.projectId === 'string' ? taskMeta.projectId : undefined;
        const registered = await this.fileAssetsRegistration.registerFromArtifacts(
          {
            companyId,
            agentId: task.assigneeId,
            taskId: task.id,
            projectId,
            skillName,
          },
          mapped,
          exec?.result,
        );

        let artifactRows = attachFileAssetIdsToArtifactRows(
          toCollaborationDeliverableArtifactRows(mapped),
          registered,
          companyId,
        );
        const requiresDeliverable = taskMeta.requiresDeliverable === true;
        const gate = this.deliverableGate.evaluate({
          artifacts: artifactRows,
          taskId: task.id,
          requiresDeliverable,
        });
        if (!gate.allowed) {
          await this.rpc('tasks.update', {
            companyId,
            actor,
            id: task.id,
            data: {
              status: 'in_progress',
              progress: 10,
              blockedReason: 'deliverable_gate_no_artifacts',
              metadata: {
                ...(task.metadata ?? {}),
                autonomousExecution: {
                  traceId,
                  skillName,
                  at: new Date().toISOString(),
                  deliverableGateBlocked: true,
                },
              },
            },
          });
          continue;
        }
        if (requiresDeliverable && !roomId) {
          this.logger.warn('pending agent task: requiresDeliverable but missing roomId', {
            taskId: task.id,
          });
        }

        if (roomId && artifactRows.length) {
          const deliverableThreadId =
            String(taskMeta.lastDispatchThreadId ?? taskMeta.threadId ?? '').trim() || null;
          const payload = buildEmployeeDeliverableMessagePayload({
            companyId,
            actor,
            roomId,
            agentId: task.assigneeId,
            traceId,
            taskId: task.id,
            skillName,
            skillExecutionId,
            department:
              typeof taskMeta.department === 'string'
                ? taskMeta.department
                : typeof taskMeta.departmentSlug === 'string'
                  ? taskMeta.departmentSlug
                  : null,
            artifacts: artifactRows,
            threadId: deliverableThreadId,
          });
          await this.rpc('collaboration.messages.appendAgent', {
            companyId,
            actor,
            roomId,
            agentId: task.assigneeId,
            content: ConversationOutputSanitizerService.toVisibleLayer(payload.content),
            messageType: 'text',
            threadId: deliverableThreadId ?? undefined,
            metadata: payload.metadata,
          });
        }

        if (
          taskMeta.directorInitiatedSubtask === true ||
          taskMeta.employeeInitiatedSubtask === true ||
          taskMeta.crossDepartmentCoordinationSubtask === true
        ) {
          phase2AgentAutonomousTasksCompletedCounter.add(1, { companyId });
        }

        await this.rpcWithRetry('tasks.update', {
          companyId,
          actor,
          id: task.id,
          data: {
            status: 'completed',
            progress: 100,
            metadata: {
              ...(task.metadata ?? {}),
              autonomousExecution: { traceId, skillName, at: new Date().toISOString() },
              ...(artifactRows.length ? { deliverableArtifacts: artifactRows } : {}),
            },
          },
        }, 3, task.id);
        if (artifactRows.length) {
          await this.rollupDeliverableArtifactsToL2Parent({
            companyId,
            actor,
            taskId: task.id,
            parentId: String(task.parentId ?? '').trim() || undefined,
            artifactRows,
          });
        }
        completedTaskIds.push(task.id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn('pending agent task execution failed', { taskId: task.id, msg });
        const er =
          ceoHeartbeatRunId?.trim() ||
          (typeof taskMeta.runId === 'string' ? taskMeta.runId : undefined) ||
          (typeof taskMeta.ceoTraceId === 'string' ? (taskMeta.ceoTraceId as string) : undefined);
        if (er) {
          await this.executionLog.appendForTask(companyId, task.id, {
            stepType: 'agent.skill.error',
            runId: er,
            traceId,
            agentId: task.assigneeId ?? undefined,
            durationMs: Date.now() - skillStartAt,
            message: msg.slice(0, 2000),
            outputSnapshot: { error: msg.slice(0, 1500) },
          });
        }
        const roomIdStr =
          typeof (task.metadata as any)?.roomId === 'string' ? ((task.metadata as any).roomId as string) : '';
        const budgetHit = this.isBudgetRelatedMessage(msg);
        if (!budgetHit && roomIdStr && typeof task.assigneeId === 'string') {
          try {
            await this.rpc('collaboration.messages.appendAgent', {
              companyId,
              actor,
              roomId: roomIdStr,
              agentId: task.assigneeId,
              content: ConversationOutputSanitizerService.toVisibleLayer(
                `execution failed: ${this.safeStringify(msg).slice(0, 2000)}`,
              ),
              messageType: 'text',
              metadata: {
                traceId: `task:${task.id}:${companyId}`,
                taskId: task.id,
                agentId: task.assigneeId,
                at: new Date().toISOString(),
                roomId: roomIdStr,
              },
            });
          } catch (e2: unknown) {
            const msg2 = e2 instanceof Error ? e2.message : String(e2);
            this.logger.warn('append execution error message failed', { msg2 });
          }
        }
        try {
          if (budgetHit && task.assigneeId) {
            await this.pauseTaskForBudget({
              companyId,
              actor,
              taskId: task.id,
              taskMeta: (task.metadata ?? {}) as Record<string, unknown>,
              reason: msg.slice(0, 2000),
              runId: er,
              roomId: roomIdStr,
              assigneeId: task.assigneeId,
              traceId: `task:${task.id}:${companyId}`,
              userMessage: `【预算】执行已阻断，任务已暂停?{this.safeStringify(msg).slice(0, 1500)}`,
            });
          } else {
            await this.rpc('tasks.update', {
              companyId,
              actor,
              id: task.id,
              data: {
                status: 'blocked',
                blockedReason: msg.slice(0, 2000),
                metadata: {
                  ...(task.metadata ?? {}),
                  autonomousExecutionError: { traceId, message: msg },
                },
              },
            });
          }
        } catch (e2: unknown) {
          this.logger.warn('tasks.update after execution failure failed', {
            taskId: task.id,
            message: e2 instanceof Error ? e2.message : String(e2),
          });
        }
      }
    }
    return { completedTaskIds, attemptedTaskIds };
  }

  private safeStringify(v: unknown): string {
    try {
      if (typeof v === 'string') return v;
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  private pickSkillName(
    task: { metadata?: Record<string, unknown> | null; title: string },
    skills: SkillToolSnapshot[],
  ): string | null {
    const fromMeta = task.metadata?.skillName ?? task.metadata?.executionSkill;
    const profileRaw = task.metadata?.executionProfile;
    const executionProfile =
      typeof profileRaw === 'string' && profileRaw.trim()
        ? (profileRaw.trim() as ExecutionProfile)
        : null;
    const picked = this.unifiedDeliverable.pickSkillName(skills, {
      preferredSkillName: typeof fromMeta === 'string' ? fromMeta : null,
      executionProfile,
    });
    if (picked) return picked;
    const boundEcho = skills.some((s) => String(s.name ?? '').trim() === 'echo');
    return boundEcho ? 'echo' : null;
  }

  /**
   * W7：员工 Agent 主动提议子任务 `employee.task.propose`（CEO 审批链消费；受 flag 门控）。
   */
  async proposeEmployeeSubtask(params: {
    companyId: string;
    traceId: string;
    fromAgentId: string;
    parentTaskId?: string;
    proposedTitle: string;
    proposedInputs?: Record<string, unknown>;
    roomId?: string;
    clientFeatureFlags?: string[];
    /** W10：扩展载荷（契约对齐 {@link EmployeeTaskProposeEnvelopeSchema}?*/
    employeeInitiated?: boolean;
    mentionedAgentIds?: string[];
    dynamicSubGraphTargets?: string[];
    predictivePath?: string;
  }): Promise<{ published: boolean; reason?: string }> {
    if (!this.config.isEmployeeAutonomousEnabled()) {
      return { published: false, reason: 'global_off' };
    }
    const ok = await this.l1Flags.isEmployeeAutonomousEffective(
      params.companyId,
      params.clientFeatureFlags,
    );
    if (!ok) {
      return { published: false, reason: 'company_off' };
    }
    const occurredAt = new Date().toISOString();
    await this.messaging.publish(
      {
        eventId: randomUUID(),
        eventType: 'employee.task.propose',
        aggregateId: `${params.traceId}:${params.fromAgentId}`,
        aggregateType: 'task',
        occurredAt,
        version: 1,
        companyId: params.companyId,
        data: {
          companyId: params.companyId,
          traceId: params.traceId,
          fromAgentId: params.fromAgentId,
          parentTaskId: params.parentTaskId,
          proposedTitle: params.proposedTitle,
          proposedInputs: params.proposedInputs,
          roomId: params.roomId,
          requestedAt: occurredAt,
          employeeInitiated: params.employeeInitiated,
          mentionedAgentIds: params.mentionedAgentIds,
          dynamicSubGraphTargets: params.dynamicSubGraphTargets,
          predictivePath: params.predictivePath,
        },
      },
      { routingKey: 'employee.task.propose', persistent: true },
    );
    return { published: true };
  }

  /** 员工子任务交付物 rollup 到 L2 父任务，便于主群结案摘要聚合 file_assets / 预览。 */
  private async rollupDeliverableArtifactsToL2Parent(params: {
    companyId: string;
    actor: { id: string; roles: string[] };
    taskId: string;
    parentId?: string;
    artifactRows: CollaborationDeliverableArtifactRow[];
  }): Promise<void> {
    const parentId = String(params.parentId ?? '').trim();
    if (!parentId || !params.artifactRows.length) return;
    try {
      const parent = await this.rpc<{ metadata?: Record<string, unknown> | null; parentId?: string | null }>(
        'tasks.findOne',
        { companyId: params.companyId, actor: params.actor, id: parentId },
      );
      const parentGk = String(parent?.metadata?.goalDelegationKey ?? '').trim();
      if (!isMainRoomL2GoalDelegationKey(parentGk)) return;
      const existing = Array.isArray(parent?.metadata?.deliverableArtifacts)
        ? (parent!.metadata!.deliverableArtifacts as CollaborationDeliverableArtifactRow[])
        : [];
      const merged = mergeDeliverableArtifactsForL2Parent(existing, params.artifactRows);
      await this.rpc('tasks.update', {
        companyId: params.companyId,
        actor: params.actor,
        id: parentId,
        data: {
          metadata: {
            ...(parent?.metadata ?? {}),
            deliverableArtifacts: merged,
            lastEmployeeDeliverableTaskId: params.taskId,
            lastEmployeeDeliverableAt: new Date().toISOString(),
          },
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn('rollup deliverableArtifacts to L2 parent failed', {
        taskId: params.taskId,
        parentId,
        msg,
      });
    }
  }

  private buildArgs(
    task: { title: string; description?: string | null; metadata?: Record<string, unknown> | null },
    skillName: string,
  ): Record<string, unknown> {
    if (skillName === 'echo') {
      return {
        message: [task.title, task.description].filter(Boolean).join('\n').slice(0, 8000),
      };
    }
    if (skillName === 'code-run') {
      const m = task.metadata ?? {};
      const command =
        typeof m.command === 'string'
          ? m.command
          : typeof m.shellCommand === 'string'
            ? m.shellCommand
            : '';
      return {
        command: command.trim() || 'true',
      };
    }
    return {
      taskTitle: task.title,
      taskDescription: task.description ?? '',
      metadata: task.metadata ?? {},
    };
  }
}
