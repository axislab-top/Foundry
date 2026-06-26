import type { RiskLevel } from '../../contracts/approval.contract.js';

export const REQUIRE_APPROVAL = 'require_approval';

export interface RequireApprovalOptions {
  riskLevel?: RiskLevel;
  action?: string;
  policyRef?: string;
}
