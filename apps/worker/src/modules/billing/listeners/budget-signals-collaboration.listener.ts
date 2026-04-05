import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BudgetCriticalLowEvent, BudgetExceededEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * 预算耗尽 / 临界：向主协作房间推送可见消息（补充仪表盘与 Admin 告警）。
 */
@Injectable()
export class BudgetSignalsCollaborationListener implements OnModuleInit {
  private readonly logger = new Logger(BudgetSignalsCollaborationListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<BudgetExceededEvent>(
      'budget.exceeded',
      this.handleExceeded.bind(this),
      {
        queue: 'worker-budget-exceeded-collab',
        durable: true,
        prefetchCount: 10,
      },
    );

    this.messaging.subscribeWithBackoff<BudgetCriticalLowEvent>(
      'budget.critical_low',
      this.handleCritical.bind(this),
      {
        queue: 'worker-budget-critical-collab',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async appendToMainRoom(companyId: string, content: string): Promise<void> {
    const actor = this.actor();
    const tm = this.config.getApiRpcTimeoutMs();
    const main = await firstValueFrom(
      this.apiRpc
        .send<{ id?: string } | null>('collaboration.rooms.findMain', { companyId, actor })
        .pipe(timeout(tm)),
    );
    const roomId = main?.id?.trim();
    if (!roomId) {
      this.logger.debug('no main collaboration room; skip budget IM', { companyId });
      return;
    }
    const agents = await firstValueFrom(
      this.apiRpc
        .send<{ items?: Array<{ id: string }> }>('agents.findAll', {
          companyId,
          actor,
          role: 'ceo',
          status: 'active',
          pageSize: 1,
          page: 1,
        })
        .pipe(timeout(tm)),
    );
    const agentId = agents?.items?.[0]?.id;
    if (!agentId) {
      this.logger.debug('no CEO agent; skip budget IM', { companyId });
      return;
    }
    await firstValueFrom(
      this.apiRpc
        .send('collaboration.messages.appendAgent', {
          companyId,
          actor,
          roomId,
          agentId,
          content,
          messageType: 'text',
          metadata: { kind: 'budget_broadcast', companyId },
        })
        .pipe(timeout(tm)),
    );
  }

  private async handleExceeded(event: BudgetExceededEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.appendToMainRoom(
          companyId,
          `【预算】公司已超支（使用率 ${(event.data.utilization * 100).toFixed(0)}%）。新任务与高额工具将被暂停，是否补充预算？`,
        );
      } catch (e: unknown) {
        this.logger.warn('budget.exceeded collaboration message failed', {
          companyId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  private async handleCritical(event: BudgetCriticalLowEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        const rem = Math.max(0, (1 - event.data.utilization) * 100);
        await this.appendToMainRoom(
          companyId,
          `【预算】剩余约 ${rem.toFixed(0)}%（临界阈值 ${(event.data.criticalThreshold * 100).toFixed(0)}%）。请关注消耗曲线并及时充值。`,
        );
      } catch (e: unknown) {
        this.logger.warn('budget.critical_low collaboration message failed', {
          companyId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
