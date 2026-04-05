import type { BaseEvent } from './base-event.js';

export type ApprovalDomainStatus = 'approved' | 'rejected' | 'expired' | 'pending' | 'cancelled';

/** 审批单状态变更（供 Collaboration / 告警 / 异步消费者） */
export interface ApprovalStatusChangedEvent extends BaseEvent {
  eventType: 'approval.status.changed';
  aggregateType: 'approval';
  data: {
    companyId: string;
    approvalRequestId: string;
    status: ApprovalDomainStatus;
    executionTokenId?: string | null;
    resolvedBy?: string;
    reason?: string;
    /** 审批单业务类型，如 config.apply、billing.external_skill_overage */
    actionType?: string | null;
  };
}

export type ApprovalEvent = ApprovalStatusChangedEvent;
