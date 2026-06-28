import { Module } from '@nestjs/common';
import { BudgetSignalsHeartbeatListener } from './listeners/budget-signals-heartbeat.listener.js';
import { BudgetSignalsCollaborationListener } from './listeners/budget-signals-collaboration.listener.js';
import { BillingConsumptionRequestedListener } from './listeners/billing-consumption-requested.listener.js';
import { TaskCompletedBillingListener } from './listeners/task-completed-billing.listener.js';
import { BillingTokenMiddleware } from './llm/billing-token.middleware.js';
import { CostAwareRouterService } from './cost-aware-router.service.js';

@Module({
  providers: [
    BillingConsumptionRequestedListener,
    TaskCompletedBillingListener,
    BudgetSignalsHeartbeatListener,
    BudgetSignalsCollaborationListener,
    BillingTokenMiddleware,
    CostAwareRouterService,
  ],
  exports: [BillingTokenMiddleware, CostAwareRouterService],
})
export class BillingWorkerModule {}
