import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { formatUnknownError, stackFromUnknown } from '@service/logging';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BillingConsumptionRequestedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * 异步消耗入账：LLM / Skill / Memory 等 Worker 侧完成后发布事件，由 API 统一计费与预算更新。
 */
@Injectable()
export class BillingConsumptionRequestedListener implements OnModuleInit {
  private readonly logger = new Logger(BillingConsumptionRequestedListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<BillingConsumptionRequestedEvent>(
      'billing.consumption.requested',
      this.handle.bind(this),
      {
        queue: 'worker-billing-consumption',
        durable: true,
        prefetchCount: 20,
        retry: {
          enabled: true,
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffFactor: 2,
          maxDelayMs: 60_000,
        },
      },
    );
  }

  private async handle(event: BillingConsumptionRequestedEvent): Promise<void> {
    const companyId =
      resolveCompanyIdFromEvent(event) || event.data?.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const actor = {
        id: this.config.getWorkerActorUserId(),
        roles: ['admin'],
      };
      const d = event.data;
      try {
        await firstValueFrom(
          this.apiRpc
            .send('billing.record.append', {
              companyId,
              actor,
              data: {
                recordType: d.recordType,
                departmentId: d.departmentId,
                agentId: d.agentId,
                taskId: d.taskId,
                skillId: d.skillId,
                modelName: d.modelName,
                llmModelId: d.llmModelId,
                llmKeyId: d.llmKeyId,
                inputTokens: d.inputTokens,
                outputTokens: d.outputTokens,
                skillCallUnits: d.skillCallUnits,
                idempotencyKey: d.idempotencyKey,
                metadata: d.metadata,
                occurredAt: d.occurredAt ? new Date(d.occurredAt) : undefined,
                pricingSnapshotJson: d.pricingSnapshotJson,
                pricingSource: d.pricingSource,
                isNominal: d.isNominal,
              },
            })
            .pipe(timeout(this.config.getBillingAppendTimeoutMs())),
        );
      } catch (e: unknown) {
        this.logger.error(
          `billing.record.append RPC failed companyId=${companyId}: ${formatUnknownError(e)}`,
          stackFromUnknown(e),
        );
        throw e;
      }
    });
  }
}
