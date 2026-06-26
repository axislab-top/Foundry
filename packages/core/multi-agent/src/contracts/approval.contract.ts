import { z } from 'zod';

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export const ApprovalDecisionSchema = z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled']);

export const ApprovalRequestSchema = z.object({
  approvalRequestId: z.string().default(() => crypto.randomUUID()),
  traceId: z.string().min(1),
  riskLevel: z.nativeEnum(RiskLevel),
  requestedAction: z.string().min(1),
  policyRef: z.string().min(1),
  approver: z.union([z.string().min(1), z.literal('human')]),
  payload: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.number().int(),
  approvalToken: z.string().optional(),
  decision: ApprovalDecisionSchema.default('pending'),
});

export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
