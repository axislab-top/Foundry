import type { BaseEvent } from './base-event.js';

export const APPROVAL_STATUS_CHANGED_ROUTING_KEY = 'approval.status.changed' as const;

export type ApprovalDomainStatus = 'approved' | 'rejected' | 'expired' | 'pending' | 'cancelled';

/** 审批单状态变更（供 Collaboration / 告警 / 异步消费者） */
export interface ApprovalStatusChangedEvent extends BaseEvent {
  eventType: typeof APPROVAL_STATUS_CHANGED_ROUTING_KEY;
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
    /** 可选：关联 ACP agent message（与 MessageIntent.APPROVAL_REQUEST 对齐） */
    agentMessageId?: string;
    traceId?: string;
  };
}

export type ApprovalEvent = ApprovalStatusChangedEvent;
