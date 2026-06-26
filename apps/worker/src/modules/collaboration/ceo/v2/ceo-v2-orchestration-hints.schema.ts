import { z } from 'zod';

export const ceoV2DistributionHintRowSchema = z.object({
  sourceTaskId: z.string().min(1),
  department: z.string().min(1),
  priority: z.enum(['P0', 'P1', 'P2']).optional(),
});

export const ceoV2DistributionHintsEnvelopeSchema = z.object({
  hints: z.array(ceoV2DistributionHintRowSchema).min(1).max(24),
});

export type CeoV2DistributionHintRow = z.infer<typeof ceoV2DistributionHintRowSchema>;
