import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent } from '@contracts/events';
import { resolveNewCompanyBudgetCredit } from '@contracts/types';
import { Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity.js';
import { BILLING_CURRENCY } from '../billing-currency.js';
import { BudgetService } from '../services/budget.service.js';
import { ModelRouterService } from '../services/model-router.service.js';
import { UserCreditService } from '../services/user-credit.service.js';

/**
 * company.created 后初始化公司级预算占位与默认计费/路由设置。
 * 账号 Credit 在 user.created 时一次性发放，多公司共用。
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
    private readonly userCreditService: UserCreditService,
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

        const ownerId = event.data?.createdBy?.trim() || company.createdBy?.trim() || '';
        if (ownerId) {
          await this.userCreditService.ensureRegistrationGrant(ownerId);
        }

        const total = resolveNewCompanyBudgetCredit({
          initialBudgetRaw: company.initialBudget,
          isFirstOwnedCompany: false,
        });

        await this.budgetService.ensureCompanyBudget(companyId, total, BILLING_CURRENCY);
        await this.modelRouter.ensureDefaultSettings(companyId);

        this.logger.log('company_billing_bootstrap', {
          companyId,
          ownerId: ownerId || undefined,
          companyBudgetPlaceholder: total,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('bootstrap billing after company.created failed', { message });
      }
    });
  }
}
