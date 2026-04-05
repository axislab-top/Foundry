import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { MessagingService } from '@service/messaging';
import type { TemplateImportedEvent } from '@contracts/events';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import { TemplateMaterializationService } from '../template-materialization.service.js';

/**
 * 模板导入后物化组织节点与 Agent（Skills/Memory 种子可继续扩展）。
 */
@Injectable()
export class TemplateImportedListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
    private readonly materialization: TemplateMaterializationService,
  ) {}

  async onModuleInit() {
    await this.messagingService.subscribe<TemplateImportedEvent>(
      'template.imported',
      this.handle.bind(this),
      {
        queue: 'template-imported-queue',
        durable: true,
        prefetchCount: 5,
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

  private async handle(event: TemplateImportedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event);
    if (companyId) {
      await this.tenantContext.runWithCompanyId(companyId, async () => {
        await this.process(event);
      });
      return;
    }
    await this.process(event);
  }

  private async process(event: TemplateImportedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(`template.imported:${event.eventId}`, 24 * 60 * 60_000);
    if (!ok) {
      this.logger.warn('Duplicate template.imported skipped', { eventId: event.eventId });
      return;
    }

    this.logger.info('Processing template.imported', {
      eventId: event.eventId,
      companyId: event.data.companyId,
      templateId: event.data.templateId,
      templateSlug: event.data.templateSlug,
    });

    await this.materialization.materializeFromTemplateImported(event);
  }
}
