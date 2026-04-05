import type { BaseEvent } from './base-event.js';

export type BillingConsumptionRecordType =
  | 'llm'
  | 'skill'
  | 'embedding'
  | 'summary'
  | 'other';

/** Worker / 网关异步上报消耗，由 API 入账 */
export interface BillingConsumptionRequestedEvent extends BaseEvent {
  eventType: 'billing.consumption.requested';
  aggregateType: 'billing';
  data: {
    companyId: string;
    recordType: BillingConsumptionRecordType;
    llmKeyId?: string;
    departmentId?: string;
    agentId?: string;
    taskId?: string;
    skillId?: string;
    modelName?: string;
    inputTokens?: number;
    outputTokens?: number;
    skillCallUnits?: number;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  };
}

export interface BudgetWarningEvent extends BaseEvent {
  eventType: 'budget.warning';
  aggregateType: 'company';
  data: {
    companyId: string;
    utilization: number;
    warningThreshold: number;
    occurredAt: string;
  };
}

export interface BudgetExceededEvent extends BaseEvent {
  eventType: 'budget.exceeded';
  aggregateType: 'company';
  data: {
    companyId: string;
    utilization: number;
    occurredAt: string;
  };
}

/** 利用率 ≥ criticalThreshold（默认约 90%，即剩余约 10%） */
export interface BudgetCriticalLowEvent extends BaseEvent {
  eventType: 'budget.critical_low';
  aggregateType: 'company';
  data: {
    companyId: string;
    utilization: number;
    criticalThreshold: number;
    occurredAt: string;
  };
}

/** API 入账成功后发布，供审计/下游同步 */
export interface BillingRecordedEvent extends BaseEvent {
  eventType: 'billing.recorded';
  aggregateType: 'billing';
  data: {
    companyId: string;
    recordId: string;
    recordType: BillingConsumptionRecordType;
    cost: string;
    currency: string;
    utilizationAfter: number;
    occurredAt: string;
  };
}

export interface ModelRoutedEvent extends BaseEvent {
  eventType: 'model.routed';
  aggregateType: 'company';
  data: {
    companyId: string;
    modelName: string;
    degraded: boolean;
    utilization: number;
    reason: string;
    agentRole: string;
    occurredAt: string;
  };
}

export type BillingEvent =
  | BillingConsumptionRequestedEvent
  | BudgetWarningEvent
  | BudgetCriticalLowEvent
  | BudgetExceededEvent
  | BillingRecordedEvent
  | ModelRoutedEvent;

export interface BillingEventTopics {
  'billing.consumption.requested': BillingConsumptionRequestedEvent;
  'budget.warning': BudgetWarningEvent;
  'budget.critical_low': BudgetCriticalLowEvent;
  'budget.exceeded': BudgetExceededEvent;
  'billing.recorded': BillingRecordedEvent;
  'model.routed': ModelRoutedEvent;
}
