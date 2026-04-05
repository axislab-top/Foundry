/** RACI 工程化风险分级 */
export type ApprovalRiskLevel = 'L0' | 'L1' | 'L2' | 'L3';

export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

/** Skill metadata：标记需 L2 执行令牌方可调用 */
export const APPROVAL_RISK_METADATA_KEY = 'approvalRiskLevel' as const;

export function skillRequiresExecutionToken(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  const v = metadata[APPROVAL_RISK_METADATA_KEY];
  return v === 'L2' || v === 'L3';
}

export interface ApprovalContextRef {
  runId?: string;
  temporalWorkflowId?: string;
  temporalRunId?: string;
  traceId?: string;
  taskId?: string;
  summary?: string;
  diffRef?: string;
}

/** 为 true 时：预算预检失败则自动创建 L2 审批单并返回结构化错误（由 Worker 处理） */
export const BUDGET_OVERAGE_REQUIRES_APPROVAL = 'budgetOverageRequiresApproval' as const;

export function skillNeedsBudgetOverageApproval(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return false;
  return metadata[BUDGET_OVERAGE_REQUIRES_APPROVAL] === true;
}
