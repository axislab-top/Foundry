import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { SkillToolSnapshot } from '@contracts/events';
import { ToolRegistry } from '@service/ai';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AgentExecutionService } from '../agents/services/agent-execution.service.js';
import { CeoApprovalGateService } from '../autonomous/services/ceo-approval-gate.service.js';

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
    private readonly ceoApprovalGate: CeoApprovalGateService,
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

  async processPendingForCompany(companyId: string): Promise<void> {
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

      // CEO gate：优先用 persisted decision，避免 multi-instance/restart 丢状态。
      const ceoApprovalDecision = taskMeta.ceoApprovalDecision;
      const ceoGateOk =
        typeof ceoApprovalDecision === 'string'
          ? ceoApprovalDecision === 'approved' || ceoApprovalDecision === 'modified'
          : typeof ceoTraceId === 'string'
            ? this.ceoApprovalGate.isCeoApproved(companyId, ceoTraceId)
            : true; // 若无 CEO trace，视为无需 CEO gate

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

        // review -> in_progress（放行后由 worker 执行继续）
        if (task.status !== 'in_progress') {
          await this.rpc('tasks.update', {
            companyId,
            actor,
            id: task.id,
            data: { status: 'in_progress', progress: 5 },
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

        const exec = await this.agentExecution.executeSkill({
          companyId,
          agentId: task.assigneeId,
          skillName,
          args,
          traceId,
          roles: actor.roles,
        });

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
        if (typeof (task.metadata as any)?.roomId === 'string' && typeof task.assigneeId === 'string') {
          const roomId = (task.metadata as any).roomId as string;
          try {
            await this.rpc('collaboration.messages.appendAgent', {
              companyId,
              actor,
              roomId,
              agentId: task.assigneeId,
              content: `execution failed: ${this.safeStringify(msg).slice(0, 2000)}`,
              messageType: 'text',
              metadata: {
                traceId: `task:${task.id}:${companyId}`,
                taskId: task.id,
                agentId: task.assigneeId,
                at: new Date().toISOString(),
                roomId,
              },
            });
          } catch (e2: unknown) {
            const msg2 = e2 instanceof Error ? e2.message : String(e2);
            this.logger.warn('append execution error message failed', { msg2 });
          }
        }
        try {
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
        } catch (e2: unknown) {
          this.logger.warn('tasks.update blocked failed', {
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
