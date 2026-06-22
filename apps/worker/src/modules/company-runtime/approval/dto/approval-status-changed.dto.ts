export interface BudgetApprovalStatusDecision {
  companyId: string;
  requestId: string;
  status: 'approved' | 'rejected';
  [key: string]: unknown;
}
