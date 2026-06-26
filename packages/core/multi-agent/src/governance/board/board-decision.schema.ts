import { z } from 'zod';
import { randomUUID } from 'crypto';

export const BoardDecisionSchema = z.object({
  boardDecisionId: z.string().default(() => randomUUID()),
  companyId: z.string().min(1),
  traceId: z.string().min(1),
  approvalFlowId: z.string().min(1),
  decision: z.enum(['approved', 'rejected', 'needs_changes']),
  decidedBy: z.union([z.string().min(1), z.literal('human')]),
  reason: z.string().optional(),
  policyVersion: z.number().int(),
  decidedAt: z.number().int().default(() => Date.now()),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type BoardDecision = z.infer<typeof BoardDecisionSchema>;

