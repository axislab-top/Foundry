import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { MessagingService } from '@service/messaging';
import type { CompanyCreatedEvent } from '@contracts/events';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';

/**
 * 注意：默认 CEO Agent、Marketplace 密钥分配、主协作房等均在 **apps/api** 的
 * `company.created` 消费者中完成（见 AgentsBootstrapService / CompanyCreated*Listener）。
 * 此处仅保留幂等与可观测占位；勿在此处实现业务 bootstrap。
 */
@Injectable()
export class CompanyCreatedListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleInit() {
    await this.messagingService.subscribe<CompanyCreatedEvent>(
      'company.created',
      this.handleCompanyCreated.bind(this),
      {
        queue: 'company-created-queue',
        durable: true,
        prefetchCount: 10,
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

  private async handleCompanyCreated(event: CompanyCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (companyId) {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.processCompanyCreated(event);
      });
      return;
    }

    await this.processCompanyCreated(event);
  }

  private async processCompanyCreated(event: CompanyCreatedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(`company.created:${event.eventId}`, 24 * 60 * 60_000);
    if (!ok) {
      this.logger.warn('Duplicate company.created skipped', {
        eventId: event.eventId,
      });
      return;
    }

    this.logger.info('Processing company.created', {
      eventId: event.eventId,
      companyId: event.data.companyId,
      companyName: event.data.name,
    });

    await Promise.all([
      this.initializeDefaultOrganization(event),
      this.initializeDefaultCeoAgent(event),
      this.initializeCompanyBudget(event),
    ]);

    this.logger.info('Processed company.created', {
      eventId: event.eventId,
      companyId: event.data.companyId,
    });
  }

  private async initializeDefaultOrganization(_event: CompanyCreatedEvent): Promise<void> {
    /* 组织树与 Agent 由 API 侧 organization / agents bootstrap 处理 */
  }

  private async initializeDefaultCeoAgent(_event: CompanyCreatedEvent): Promise<void> {
    /* CEO 与 llmKey 分配由 API AgentsBootstrapService 处理 */
  }

  private async initializeCompanyBudget(_event: CompanyCreatedEvent): Promise<void> {
    /* 预算开户等由 API billing / company 流程处理 */
  }
}
