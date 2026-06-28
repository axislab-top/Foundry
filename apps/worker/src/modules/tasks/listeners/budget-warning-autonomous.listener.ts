import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BudgetWarningEvent } from '@contracts/events';
import { AutonomousTriggerService } from '../../autonomous/autonomous-trigger.service.js';
import { AutonomousRunCoordinatorService } from '../../autonomous/autonomous-run-coordinator.service.js';

@Injectable()
export class BudgetWarningAutonomousListener implements OnModuleInit {
  private readonly logger = new Logger(BudgetWarningAutonomousListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly triggers: AutonomousTriggerService,
    private readonly runCoordinator: AutonomousRunCoordinatorService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<BudgetWarningEvent>(
      'budget.warning',
      this.handle.bind(this),
      {
        queue: 'worker-budget-warning-autonomous',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: BudgetWarningEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;
    if (!(await this.triggers.shouldRun(companyId, 'budget_warning'))) {
      this.logger.debug('budget.warning autonomous skipped (cooldown)', { companyId });
      return;
    }
    const tickAt = new Date().toISOString();
    await this.runCoordinator.runEventTriggeredCycle({
      companyId,
      tickAt,
      triggerSource: 'budget_warning',
    });
  }
}
