import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { AgentCreatedEvent } from '@contracts/events';
import { BudgetService } from '../services/budget.service.js';

const DEFAULT_AGENT_BUDGET = 200;

/**
 * agent.created 后初始化 Agent 级预算行（配额上限），供统计与后续部门/Agent 维度控制。
 */
@Injectable()
export class AgentCreatedBillingListener implements OnModuleInit {
  private readonly logger = new Logger(AgentCreatedBillingListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly budgetService: BudgetService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<AgentCreatedEvent>(
      'agent.created',
      this.handle.bind(this),
      {
        queue: 'api-agent-created-billing',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: AgentCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    const agentId = event.data?.agentId;
    if (!companyId || !agentId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.budgetService.ensureAgentBudget(
          companyId,
          agentId,
          DEFAULT_AGENT_BUDGET,
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('ensureAgentBudget failed', { companyId, agentId, message });
      }
    });
  }
}
