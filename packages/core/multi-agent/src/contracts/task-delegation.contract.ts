import { z } from 'zod';
import { createAgentMessage, MessageIntent } from './agent-message.contract.js';

export const TaskDelegationStatusSchema = z.enum([
  'queued',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
]);

export const TaskDelegationSchema = z.object({
  taskId: z.string().min(1),
  parentTaskId: z.string().optional(),
  ownerAgentId: z.string().min(1),
  executorAgentId: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
  constraints: z
    .object({
      budgetCap: z.number().nonnegative().optional(),
      slaSeconds: z.number().int().positive().optional(),
      maxRetries: z.number().int().nonnegative().default(3),
    })
    .optional(),
  dependsOn: z.array(z.string()).default([]),
  status: TaskDelegationStatusSchema.default('queued'),
});

export type TaskDelegation = z.infer<typeof TaskDelegationSchema>;

export function createTaskDelegationMessage(
  delegation: TaskDelegation,
  traceId: string,
  fromAgentId: string,
  toAgentId: string,
  companyId: string,
) {
  return createAgentMessage({
    traceId,
    fromAgentId,
    toAgentId,
    intent: MessageIntent.TASK_DELEGATE,
    payload: { delegation },
    context: { companyId },
  });
}
