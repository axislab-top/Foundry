import type { RiskLevel } from '../../contracts/approval.contract.js';

export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

export interface ApprovalStep {
  level: ApprovalLevel;
  approver: string | 'human';
  status: ApprovalStepStatus;
  approvedAt?: number;
  reason?: string;
}

export enum ApprovalLevel {
  /** Low risk: automatically approved (no human). */
  AUTO = 'auto',
  DEPT_SUPERVISOR = 'dept_supervisor',
  CEO = 'ceo',
  /** Highest level: real human decision required. */
  BOARD = 'board',
}

export interface MultiLevelApprovalStartParams {
  originalAction: string;
  riskLevel: RiskLevel;
  /** Policy version used to build the flow; must be audit-able & rollback-able. */
  policyVersion: number;
  /** Epoch millis. */
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

