import { Module } from '@nestjs/common';
import { BudgetSignalsHeartbeatListener } from './listeners/budget-signals-heartbeat.listener.js';
import { BillingConsumptionRequestedListener } from './listeners/billing-consumption-requested.listener.js';
import { TaskCompletedBillingListener } from './listeners/task-completed-billing.listener.js';

@Module({
  providers: [
    BillingConsumptionRequestedListener,
    TaskCompletedBillingListener,
    BudgetSignalsHeartbeatListener,
  ],
})
export class BillingWorkerModule {}
