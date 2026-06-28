import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskSupervisionRequestedEvent } from '@contracts/events';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { CeoV2SupervisionService } from '../../collaboration/ceo/v2/ceo-v2-supervision.service.js';

@Injectable()
export class DepartmentTaskSupervisionListener implements OnModuleInit {
  private readonly logger = new Logger(DepartmentTaskSupervisionListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly ceoSupervision: CeoV2SupervisionService,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskSupervisionRequestedEvent>(
      'task.supervision.requested',
      this.handle.bind(this),
      { queue: 'worker-dept-task-supervision', durable: true, prefetchCount: 3 },
    );
  }

  private async handle(event: TaskSupervisionRequestedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    const parentTaskId = event.data?.parentTaskId;
    if (!companyId || !parentTaskId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const act = this.actor();
      let parent: Record<string, unknown>;
      try {
        parent = (await this.rpc<Record<string, unknown>>('tasks.findOne', {
          companyId,
          actor: act,
          id: parentTaskId,
        })) as Record<string, unknown>;
      } catch (e: unknown) {
        this.logger.warn('dept_supervision.find_parent_failed', {
          companyId,
          parentTaskId,
          message: e instanceof Error ? e.message : String(e),
        });
        return;
      }
      if (String(parent?.status ?? '') !== 'awaiting_supervision') {
        this.logger.debug('dept_supervision.skip_wrong_status', {
          parentTaskId,
          status: parent?.status,
        });
        return;
      }

      const meta =
        parent.metadata && typeof parent.metadata === 'object'
          ? (parent.metadata as Record<string, unknown>)
          : null;
      const dp = meta?.['deptPipeline'];
      const sup = dp && typeof dp === 'object' ? (dp as Record<string, unknown>)['supervision'] : null;
      const supState =
        sup && typeof sup === 'object' ? String((sup as Record<string, unknown>)['state'] ?? '').trim() : '';
      if (supState === 'human_required' || supState === 'failed' || supState === 'passed') {
        this.logger.debug('dept_supervision.skip_terminal_supervision', { parentTaskId, supState });
        return;
      }

      const list = await this.rpc<{ items?: unknown[] }>('tasks.findAll', {
        companyId,
        actor: act,
        parentId: parentTaskId,
        page: 1,
        pageSize: 100,
      });
      const items = Array.isArray(list?.items) ? list.items : [];

      const evidence = {
        parent: {
          id: parent.id,
          title: parent.title,
          status: parent.status,
          metadata: parent.metadata,
        },
        children: items.map((t: Record<string, unknown>) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          assigneeType: t.assigneeType,
          assigneeId: t.assigneeId,
          expectedOutput: t.expectedOutput,
          metadata: t.metadata,
          description:
            typeof t.description === 'string' ? (t.description as string).slice(0, 2000) : t.description,
        })),
      };

      const verdict = await this.ceoSupervision.reviewDepartmentTaskPipelineEvidence({
        companyId,
        parentTaskId,
        evidence,
      });

      try {
        await this.rpc('tasks.supervision.resolve', {
          companyId,
          actor: act,
          data: {
            parentTaskId,
            decision: verdict.decision,
            summary: verdict.summary,
            failureReason: verdict.failureReason,
          },
        });
      } catch (e: unknown) {
        this.logger.warn('dept_supervision.resolve_failed', {
          companyId,
          parentTaskId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
