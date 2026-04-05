import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent } from '@contracts/events';
import { Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity.js';
import { BudgetService } from '../services/budget.service.js';
import { ModelRouterService } from '../services/model-router.service.js';

/**
 * company.created 后初始化公司级预算与默认计费/路由设置。
 */
@Injectable()
export class CompanyCreatedBillingListener implements OnModuleInit {
  private readonly logger = new Logger(CompanyCreatedBillingListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    private readonly budgetService: BudgetService,
    private readonly modelRouter: ModelRouterService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CompanyCreatedEvent>(
      'company.created',
      this.handle.bind(this),
      {
        queue: 'api-company-created-billing',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: CompanyCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        const company = await this.companiesRepo.findOne({
          where: { id: companyId },
        });
        if (!company) return;

        const raw = company.initialBudget;
        const total =
          raw !== null && raw !== undefined && String(raw).trim() !== ''
            ? parseFloat(String(raw))
            : 1000;

        await this.budgetService.ensureCompanyBudget(companyId, Number.isFinite(total) ? total : 1000);
        await this.modelRouter.ensureDefaultSettings(companyId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('bootstrap billing after company.created failed', { message });
      }
    });
  }
}
