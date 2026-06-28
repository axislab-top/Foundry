import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { formatUnknownError } from '@service/logging';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { TaskHeartbeatTickEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * 与 Task Heartbeat 联动：周期性刷新预算预警/超额信号（不新增消耗行）。
 */
@Injectable()
export class BudgetSignalsHeartbeatListener implements OnModuleInit {
  private readonly logger = new Logger(BudgetSignalsHeartbeatListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskHeartbeatTickEvent>(
      'task.heartbeat.tick',
      this.handle.bind(this),
      {
        queue: 'worker-budget-signals-heartbeat',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: TaskHeartbeatTickEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const actor = {
        id: this.config.getWorkerActorUserId(),
        roles: ['admin'],
      };
      try {
        const rpcMs = this.config.getApiRpcTimeoutMs();
        await firstValueFrom(
          this.apiRpc
            .send('billing.signals.refresh', { companyId, actor })
            .pipe(timeout(rpcMs)),
        );
      } catch (e: unknown) {
        this.logger.warn(
          `billing.signals.refresh failed companyId=${companyId}: ${formatUnknownError(e)}`,
        );
      }
    });
  }
}
