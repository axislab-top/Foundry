import { z } from 'zod';

export const ceoPlanTaskSchema = z.object({
  title: z.string().min(1).max(512),
  description: z.string().optional(),
  organizationNodeId: z.string().uuid().optional(),
  assigneeAgentId: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export const ceoPlanSchema = z.object({
  summary: z.string(),
  tasks: z.array(ceoPlanTaskSchema).max(20),
  requiresHumanApproval: z.boolean(),
  approvalReason: z.string().optional(),
});

export type CeoPlanOutput = z.infer<typeof ceoPlanSchema>;
