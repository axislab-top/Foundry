export type BudgetApprovalDecisionStatus = 'approved' | 'rejected' | 'expired';

export interface BudgetApprovalStatusDecision {
  companyId: string;
  approvalRequestId: string;
  actionType?: string | null;
  status: BudgetApprovalDecisionStatus;
  reason?: string;
  resolvedBy?: string;
  executionTokenId?: string | null;
}
