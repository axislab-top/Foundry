import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { SkillToolSnapshot } from '@contracts/events';
import { ToolRegistry } from '@service/ai';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AgentExecutionService } from '../agents/services/agent-execution.service.js';
import { WorkerExecutionLogService } from '../../common/observability/worker-execution-log.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';

/**
 * 心跳后消费「待执行的 Agent 任务」：拉取快照 → 注入 ToolRegistry → executeSkill → 更新任务状态。
 */
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
          content: userMessage,
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
    if (threshold <= 0 || estimatedCost < threshold) {
      return true;
    }

    const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
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
        const created = await this.rpc<{ id: string }>('approval.create', {
          companyId,
          actor,
          actionType: 'budget.autonomous.task.execute',
          riskLevel: 'L2',
          context: {
            taskId: task.id,
            taskTitle: task.title.slice(0, 200),
            assigneeId: task.assigneeId ?? null,
            estimatedCost,
            threshold,
            traceId,
            runId: runId ?? null,
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

  async processPendingForCompany(companyId: string, ceoHeartbeatRunId?: string): Promise<void> {
    const actor = this.actor();
    const fetchByStatus = async (
      status: 'pending' | 'review' | 'in_progress',
    ): Promise<
      Array<{
        id: string;
        title: string;
        status: string;
        requiresHumanApproval: boolean;
        metadata?: Record<string, unknown> | null;
        assigneeType?: string;
        assigneeId?: string | null;
      }>
    > => {
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
        companyId,
        actor,
        status,
        assigneeType: 'agent',
        pageSize: 15,
        page: 1,
      });
      return list?.items ?? [];
    };

    const items = [
      ...(await fetchByStatus('pending')),
      ...(await fetchByStatus('review')),
      ...(await fetchByStatus('in_progress')),
    ];

    for (const task of items) {
      if (task.assigneeType !== 'agent' || !task.assigneeId) {
        continue;
      }

      const ceoTraceId = (task.metadata as any)?.ceoTraceId;
      const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;

      // CEO gate：仅以任务 metadata 持久化决策为准（M4：不再依赖进程内存 gate，避免 Worker 重启绕过）。
      const ceoApprovalDecision = taskMeta.ceoApprovalDecision;
      const ceoGateOk =
        typeof ceoTraceId !== 'string'
          ? true
          : typeof ceoApprovalDecision === 'string' &&
            (ceoApprovalDecision === 'approved' || ceoApprovalDecision === 'modified');

      if (!ceoGateOk) {
        // CEO 未放行：不做 review->in_progress 的任何操作，等待后续 tick 放行
        continue;
      }

      // Human-in-the-loop：真正的“用户审批”由 review -> in_progress/blocked 这一状态迁移表示。
      // Worker 不再自动把 review 推进执行，避免绕过用户 approval card。
      const requiresHumanApproval = !!task.requiresHumanApproval;
      if (requiresHumanApproval) {
        if (task.status === 'pending') {
          // CEO 已放行后，把 pending 推到 review，触发 approval:needed（由前端弹窗完成放行/拒绝）
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

      // requiresHumanApproval=false：允许直接执行（pending/review -> 自动 push in_progress）

      const traceId = `task:${task.id}:${companyId}`;
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
        const hydrated = await this.rpc<{ skills: SkillToolSnapshot[] }>(
          'agents.effectiveSkillSnapshots',
          {
            companyId,
            actor,
            id: task.assigneeId,
          },
        );
        this.registry.setAgentTools(companyId, task.assigneeId, hydrated.skills ?? []);

        const skillName = this.pickSkillName(task, hydrated.skills ?? []);
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

        // review -> in_progress（放行后由 worker 执行继续）
        if (task.status !== 'in_progress') {
          await this.rpc('tasks.update', {
            companyId,
            actor,
            id: task.id,
            data: { status: 'in_progress', progress: 5 },
          });
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
            },
          });
        }

        if (roomId) {
          const toolCallContent = `tool_call: ${skillName}\nargs: ${this.safeStringify(args).slice(0, 2000)}`;
          await this.rpc('collaboration.messages.appendAgent', {
            companyId,
            actor,
            roomId,
            agentId: task.assigneeId,
            content: toolCallContent,
            messageType: 'tool_call',
            metadata: {
              traceId,
              taskId: task.id,
              agentId: task.assigneeId,
              skillName,
              roomId,
            },
          });
        }

        // TODO: P8 必须迁移到 runner.execute RPC（当前仍为临时路径）
        const exec = await this.agentExecution.executeSkill({
          companyId,
          agentId: task.assigneeId,
          projectId: scope.projectId,
          skillName,
          args,
          traceId,
          roles: actor.roles,
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
            },
          });
        }

        if (roomId) {
          const resultText = this.safeStringify(exec?.result).slice(0, 4000);
          // 这里不强依赖 executeSkill 的返回结构，避免 result 过大；
          // publishExecuted 会把完整结果写入 MQ / 审计链路（后续可再补）。
          await this.rpc('collaboration.messages.appendAgent', {
            companyId,
            actor,
            roomId,
            agentId: task.assigneeId,
            content: `execution result: ${skillName}\n${resultText}`,
            messageType: 'text',
            metadata: {
              traceId,
              taskId: task.id,
              agentId: task.assigneeId,
              skillName,
              at: new Date().toISOString(),
              roomId,
            },
          });
        }

        await this.rpc('tasks.update', {
          companyId,
          actor,
          id: task.id,
          data: {
            status: 'completed',
            progress: 100,
            metadata: {
              ...(task.metadata ?? {}),
              autonomousExecution: { traceId, skillName, at: new Date().toISOString() },
            },
          },
        });
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
              content: `execution failed: ${this.safeStringify(msg).slice(0, 2000)}`,
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
              userMessage: `【预算】执行已阻断，任务已暂停：${this.safeStringify(msg).slice(0, 1500)}`,
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
  ): string {
    const fromMeta = task.metadata?.skillName ?? task.metadata?.executionSkill;
    if (typeof fromMeta === 'string' && fromMeta.length > 0) {
      return fromMeta;
    }
    const first = skills.find((s) => s.name);
    if (first?.name) {
      return first.name;
    }
    return 'echo';
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
    return {
      taskTitle: task.title,
      taskDescription: task.description ?? '',
      metadata: task.metadata ?? {},
    };
  }
}
