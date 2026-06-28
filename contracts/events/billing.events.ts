import type { BaseEvent } from './base-event.js';

export type BillingConsumptionRecordType =
  | 'llm'
  | 'skill'
  | 'embedding'
  | 'summary'
  | 'agent_day'
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
    /** 与 `llm_models.id` 对齐时优先匹配 `model_pricing.llm_model_id` */
    llmModelId?: string;
    inputTokens?: number;
    outputTokens?: number;
    skillCallUnits?: number;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
    /** 冻结定价快照（与 AppendBillingRecordDto 对齐） */
    pricingSnapshotJson?: Record<string, unknown>;
    pricingSource?: string;
    /** 名义占位（task.completed 等），API 侧 cost=0 且不占密钥日用量 */
    isNominal?: boolean;
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

/** 人工/PSP 充值审批通过，已增加公司级 budgets.total_amount */
export interface BillingRechargeCompletedEvent extends BaseEvent {
  eventType: 'billing.recharge.completed';
  aggregateType: 'billing_recharge_order';
  data: {
    companyId: string;
    orderId: string;
    amount: string;
    currency: string;
    budgetId: string;
    budgetTotalAfter: string;
    occurredAt: string;
  };
}

export interface BillingRechargeRejectedEvent extends BaseEvent {
  eventType: 'billing.recharge.rejected';
  aggregateType: 'billing_recharge_order';
  data: {
    companyId: string;
    orderId: string;
    rejectReason?: string;
    occurredAt: string;
  };
}

export type BillingEvent =
  | BillingConsumptionRequestedEvent
  | BudgetWarningEvent
  | BudgetCriticalLowEvent
  | BudgetExceededEvent
  | BillingRecordedEvent
  | ModelRoutedEvent
  | BillingRechargeCompletedEvent
  | BillingRechargeRejectedEvent;

export interface BillingEventTopics {
  'billing.consumption.requested': BillingConsumptionRequestedEvent;
  'budget.warning': BudgetWarningEvent;
  'budget.critical_low': BudgetCriticalLowEvent;
  'budget.exceeded': BudgetExceededEvent;
  'billing.recorded': BillingRecordedEvent;
  'model.routed': ModelRoutedEvent;
  'billing.recharge.completed': BillingRechargeCompletedEvent;
  'billing.recharge.rejected': BillingRechargeRejectedEvent;
}
