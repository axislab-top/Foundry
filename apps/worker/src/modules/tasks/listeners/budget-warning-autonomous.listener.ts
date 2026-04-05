import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BudgetWarningEvent } from '@contracts/events';
import { AutonomousOrchestratorService } from '../../autonomous/autonomous-orchestrator.service.js';
import { AutonomousTriggerService } from '../../autonomous/autonomous-trigger.service.js';

@Injectable()
export class BudgetWarningAutonomousListener implements OnModuleInit {
  private readonly logger = new Logger(BudgetWarningAutonomousListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly autonomous: AutonomousOrchestratorService,
    private readonly triggers: AutonomousTriggerService,
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
    if (!this.triggers.shouldRun(companyId, 'budget_warning')) {
      this.logger.debug('budget.warning autonomous skipped (cooldown)', { companyId });
      return;
    }
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const tickAt = new Date().toISOString();
      try {
        await this.autonomous.runHeartbeat(companyId, tickAt, {
          triggerSource: 'budget_warning',
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('runHeartbeat after budget.warning failed', { companyId, message });
      }
    });
  }
}
