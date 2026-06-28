import type { BudgetApprovalDecisionStatus } from '../dto/approval-status-changed.dto.js';

export interface ApprovalDecision {
  eventId?: string;
  companyId: string;
  approvalRequestId: string;
  actionType?: string | null;
  status: BudgetApprovalDecisionStatus;
  reason?: string;
  resolvedBy?: string;
  executionTokenId?: string | null;
}
