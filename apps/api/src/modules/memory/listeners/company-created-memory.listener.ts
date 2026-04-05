import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent } from '@contracts/events';
import { MemoryService } from '../services/memory.service.js';
import { companyNamespace } from '../utils/memory-namespace.js';

/** 公司创建后预置 company 级记忆集合 */
@Injectable()
export class CompanyCreatedMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(CompanyCreatedMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CompanyCreatedEvent>(
      'company.created',
      this.handle.bind(this),
      {
        queue: 'api-company-created-memory',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: CompanyCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.memory.ensureCollection(
        companyId,
        companyNamespace(),
        event.data.name ? `Company: ${event.data.name}` : 'Company memory',
        'company.bootstrap',
      );
      this.logger.log('memory collection ready for company', { companyId });
    });
  }
}
