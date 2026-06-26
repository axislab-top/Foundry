import { z } from 'zod';
import { randomUUID } from 'crypto';
import { RiskLevel } from '../../contracts/approval.contract.js';
import { ApprovalLevel } from './types.js';

export const ApprovalStepSchema = z.object({
  level: z.nativeEnum(ApprovalLevel),
  approver: z.union([z.string().min(1), z.literal('human')]),
  status: z.enum(['pending', 'approved', 'rejected', 'skipped']),
  approvedAt: z.number().int().optional(),
  reason: z.string().optional(),
  /** Phase 3/4 compatibility: the underlying approval request id created for this step, if any. */
  approvalId: z.string().min(1).optional(),
  /** Optional grouping for parallel approvals (same groupId => can run concurrently). */
  groupId: z.string().min(1).optional(),
  /** Optional: absolute epoch millis when this step times out. */
  timeoutAt: z.number().int().optional(),
  /** Optional: escalation target when step times out (or policy says). */
  escalateTo: z.nativeEnum(ApprovalLevel).optional(),
});

export const MultiLevelApprovalSchema = z.object({
  approvalFlowId: z.string().default(() => randomUUID()),
  traceId: z.string().min(1),
  companyId: z.string().min(1),
  originalAction: z.string().min(1),
  riskLevel: z.nativeEnum(RiskLevel),
  currentLevel: z.nativeEnum(ApprovalLevel),
  levels: z.array(ApprovalStepSchema),
  policyVersion: z.number().int(),
  expiresAt: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  /** Overall flow status for orchestration/state-machine. */
  status: z.enum(['running', 'approved', 'rejected', 'expired', 'cancelled']).default('running'),
  /** Current step cursor (index in `levels`). */
  currentIndex: z.number().int().min(0).default(0),
});

export type MultiLevelApproval = z.infer<typeof MultiLevelApprovalSchema>;

