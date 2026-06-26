import { z } from 'zod';

export enum MessageIntent {
  TASK_DELEGATE = 'task.delegate',
  TASK_UPDATE = 'task.update',
  APPROVAL_REQUEST = 'approval.request',
  APPROVAL_RESPONSE = 'approval.response',
  HEARTBEAT = 'system.heartbeat',
  MEMORY_UPDATE = 'memory.update',
  HUMAN_IN_LOOP = 'human.request',
}

export const AgentMessageStatusSchema = z.enum([
  'created',
  'dispatched',
  'acked',
  'completed',
  'failed',
  'timeout',
]);

export const AgentMessageSchema = z.object({
  messageId: z.string().default(() => crypto.randomUUID()),
  traceId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.union([z.string().min(1), z.literal('broadcast')]),
  intent: z.nativeEnum(MessageIntent),
  payload: z.record(z.string(), z.unknown()),
  context: z.object({
    companyId: z.string(),
    tenantId: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  ttl: z.number().int().positive().default(3600),
  timestamp: z.number().int().default(() => Date.now()),
  idempotencyKey: z.string().optional(),
  status: AgentMessageStatusSchema.default('created'),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export function createAgentMessage(partial: Partial<AgentMessage>): AgentMessage {
  const msg = AgentMessageSchema.parse(partial);
  return {
    ...msg,
    idempotencyKey: partial.idempotencyKey ?? `${msg.traceId}-${msg.messageId}`,
  };
}
