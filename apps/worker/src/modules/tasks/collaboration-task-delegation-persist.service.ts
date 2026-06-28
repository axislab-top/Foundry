import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import {
  COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
  type EmployeeTaskProposedEvent,
  type TaskDelegationRequestedEvent,
} from '@contracts/events';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { TenantContextService } from '@service/tenant';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';

type TaskRow = {
  id?: string;
  parentId?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class CollaborationTaskDelegationPersistService {
  private readonly logger = new Logger(CollaborationTaskDelegationPersistService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly pendingAgentTasks: PendingAgentTaskExecutionService,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    const ms = Math.max(4_000, Math.min(60_000, this.config.getApiRpcTimeoutMs()));
    return firstValueFrom(this.apiRpc.send<T>(pattern, payload).pipe(timeout({ first: ms })));
  }

  async persistDelegationRequested(event: TaskDelegationRequestedEvent): Promise<void> {
    const companyId = String(event.companyId ?? event.data?.companyId ?? '').trim();
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const data = event.data;
      const delegation = data.delegation;
      const executorAgentId = String(delegation?.executorAgentId ?? data.toAgentId ?? '').trim();
      if (!executorAgentId) {
        this.logger.warn('foundry.task_delegation.persist_skipped', {
          companyId,
          reason: 'missing_executor_agent',
        });
        return;
      }

      const idempotencyKey = `collab-delegation:${String(delegation.taskId).trim()}`;
      const existing = await this.findByDelegationIdempotency(companyId, idempotencyKey);
      if (existing?.id) {
        this.logger.log('foundry.task_delegation.persist_idempotent_hit', {
          companyId,
          taskId: existing.id,
          idempotencyKey,
        });
        return;
      }

      const inputs =
        delegation.inputs && typeof delegation.inputs === 'object'
          ? (delegation.inputs as Record<string, unknown>)
          : {};
      const parentTaskId = await this.resolveParentTaskId(companyId, delegation, inputs);
      const title =
        typeof inputs.directorSubTitle === 'string' && inputs.directorSubTitle.trim()
          ? String(inputs.directorSubTitle).trim().slice(0, 240)
          : typeof inputs.employeeInitiatedSubtask === 'boolean' && inputs.employeeInitiatedSubtask
            ? '员工子任务'
            : '部门子任务';
      const description =
        typeof inputs.contentPreview === 'string' && inputs.contentPreview.trim()
          ? String(inputs.contentPreview).trim().slice(0, 4000)
          : null;

      try {
        const created = await this.rpc<TaskRow>('tasks.create', {
          companyId,
          actor: this.actor(),
          source: 'autonomous',
          data: {
            title,
            description,
            priority: 'normal',
            parentId: parentTaskId ?? undefined,
            assigneeType: 'agent',
            assigneeId: executorAgentId,
            requiresHumanApproval: false,
            metadata: {
              delegationIdempotencyKey: idempotencyKey,
              ceoTraceId: String(data.traceId ?? '').trim() || undefined,
              ceoApprovalDecision:
                inputs.directorInitiatedSubtask === true ? 'approved' : undefined,
              directorInitiatedSubtask: inputs.directorInitiatedSubtask === true,
              employeeInitiatedSubtask: inputs.employeeInitiatedSubtask === true,
              requiresDeliverable:
                inputs.directorInitiatedSubtask === true ||
                Boolean(String(inputs.l2SubGoalTaskId ?? '').trim()),
              collaborationDelegationTaskId: delegation.taskId,
              roomId: typeof inputs.roomId === 'string' ? inputs.roomId : undefined,
              threadId: typeof inputs.threadId === 'string' ? inputs.threadId : undefined,
              lastDispatchThreadId:
                typeof inputs.threadId === 'string' ? inputs.threadId : undefined,
              surface: typeof inputs.surface === 'string' ? inputs.surface : undefined,
              distributionId:
                typeof inputs.distributionId === 'string' ? inputs.distributionId.trim() : undefined,
              distributionPlanTaskId:
                typeof inputs.distributionPlanTaskId === 'string'
                  ? inputs.distributionPlanTaskId.trim()
                  : undefined,
              parentGoalTaskId:
                typeof inputs.parentGoalTaskId === 'string' ? inputs.parentGoalTaskId.trim() : undefined,
              directorAgentId:
                typeof inputs.directorAgentId === 'string'
                  ? inputs.directorAgentId.trim()
                  : String(delegation.ownerAgentId ?? '').trim() || undefined,
              departmentSlug:
                typeof inputs.departmentSlug === 'string' ? inputs.departmentSlug.trim() : undefined,
              department:
                typeof inputs.departmentSlug === 'string'
                  ? inputs.departmentSlug.trim()
                  : typeof inputs.department === 'string'
                    ? inputs.department.trim()
                    : undefined,
            },
          },
        });

        this.logger.log('foundry.task_delegation.persist_ok', {
          companyId,
          createdTaskId: created?.id,
          parentTaskId: parentTaskId ?? null,
          executorAgentId,
          eventType: COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
        });

        await this.pendingAgentTasks.processPendingForCompany(companyId).catch((e: unknown) => {
          this.logger.warn('foundry.task_delegation.pending_scan_failed', {
            companyId,
            message: e instanceof Error ? e.message : String(e),
          });
        });
      } catch (e: unknown) {
        this.logger.warn('foundry.task_delegation.persist_failed', {
          companyId,
          executorAgentId,
          parentTaskId: parentTaskId ?? null,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  async persistEmployeeTaskProposed(event: EmployeeTaskProposedEvent): Promise<void> {
    const companyId = String(event.companyId ?? event.data?.companyId ?? '').trim();
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const data = event.data;
      const fromAgentId = String(data.fromAgentId ?? '').trim();
      if (!fromAgentId) return;

      const assigneeId =
        (Array.isArray(data.mentionedAgentIds) ? data.mentionedAgentIds : [])
          .map((id) => String(id ?? '').trim())
          .find((id) => id && id !== fromAgentId) ?? fromAgentId;

      const idempotencyKey = `employee-propose:${data.traceId}:${fromAgentId}:${data.proposedTitle.slice(0, 80)}`;
      const existing = await this.findByDelegationIdempotency(companyId, idempotencyKey);
      if (existing?.id) return;

      const parentTaskId = String(data.parentTaskId ?? '').trim() || undefined;

      try {
        const created = await this.rpc<TaskRow>('tasks.create', {
          companyId,
          actor: this.actor(),
          source: 'autonomous',
          data: {
            title: data.proposedTitle.trim().slice(0, 240),
            description:
              data.proposedInputs && typeof data.proposedInputs === 'object'
                ? JSON.stringify(data.proposedInputs).slice(0, 4000)
                : null,
            priority: 'normal',
            parentId: parentTaskId,
            assigneeType: 'agent',
            assigneeId,
            requiresHumanApproval: data.employeeInitiated === true,
            metadata: {
              delegationIdempotencyKey: idempotencyKey,
              employeeInitiated: data.employeeInitiated === true,
              employeeProposed: true,
              ceoTraceId: data.traceId,
              roomId: data.roomId,
              proposedInputs: data.proposedInputs,
            },
          },
        });

        this.logger.log('foundry.employee_task_propose.persist_ok', {
          companyId,
          createdTaskId: created?.id,
          assigneeId,
        });

        await this.pendingAgentTasks.processPendingForCompany(companyId).catch(() => undefined);
      } catch (e: unknown) {
        this.logger.warn('foundry.employee_task_propose.persist_failed', {
          companyId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  private async findByDelegationIdempotency(
    companyId: string,
    idempotencyKey: string,
  ): Promise<TaskRow | null> {
    try {
      const res = await this.rpc<{ items?: TaskRow[] }>('tasks.findAll', {
        companyId,
        actor: this.actor(),
        page: 1,
        pageSize: 100,
        status: undefined,
      });
      const items = Array.isArray(res?.items) ? res.items : [];
      for (const row of items) {
        const meta = row.metadata;
        if (meta && String(meta.delegationIdempotencyKey ?? '') === idempotencyKey) {
          return row;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private async resolveParentTaskId(
    companyId: string,
    delegation: TaskDelegationRequestedEvent['data']['delegation'],
    inputs: Record<string, unknown>,
  ): Promise<string | null> {
    const explicit = String(delegation.parentTaskId ?? '').trim();
    if (explicit) return explicit;

    const l2Sub = String(inputs.l2SubGoalTaskId ?? '').trim();
    if (l2Sub) return l2Sub;

    const roomId = String(inputs.roomId ?? '').trim();
    const directorId = String(delegation.ownerAgentId ?? '').trim();
    if (!roomId) return null;

    try {
      const goals = await this.rpc<{ items?: Array<Record<string, unknown>> }>('tasks.goals.listByRoom', {
        companyId,
        actor: this.actor(),
        roomId,
        goalLevel: 'sub',
      });
      const items = Array.isArray(goals?.items) ? goals.items : [];
      const match =
        items.find((g) => String(g.assigneeId ?? '') === directorId) ??
        items.find((g) => String(g.id ?? '') === l2Sub) ??
        items[0];
      const id = match && typeof match.id === 'string' ? match.id.trim() : '';
      return id || null;
    } catch {
      return null;
    }
  }
}
