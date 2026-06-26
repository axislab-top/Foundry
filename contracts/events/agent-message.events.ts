import type { BaseEvent } from './base-event.js';
import { z } from 'zod';

/** Routing keys（MQ topic） */
export const COLLABORATION_AGENT_MESSAGE_RECEIVED_ROUTING_KEY = 'collaboration.agent-message.received' as const;
export const COLLABORATION_AGENT_MESSAGE_ACKED_ROUTING_KEY = 'collaboration.agent-message.acked' as const;
/** W7：领域总线 V2 出站（与 received 载荷同构，便于审计分流；入站仍以 legacy/received 为准时可并行订阅） */
export const COLLABORATION_AGENT_MESSAGE_DOMAIN_V2_ROUTING_KEY =
  'collaboration.agent-message.domain.v2' as const;

/** Legacy Pipeline 桥接键（ACP → chat） */
export const COLLABORATION_MESSAGE_RECEIVED_LEGACY_ROUTING_KEY = 'collaboration.message.received' as const;

/** 与 @foundry/multi-agent-core AgentMessageSchema 对齐的最小载荷（事件 envelope） */
export const CollaborationAgentMessageEnvelopeSchema = z.object({
  messageId: z.string().min(1),
  traceId: z.string().min(1),
  fromAgentId: z.string().min(1),
  toAgentId: z.union([z.string().min(1), z.literal('broadcast')]),
  intent: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  context: z.object({
    companyId: z.string().min(1),
    tenantId: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  status: z.string().optional(),
});

export type CollaborationAgentMessageEnvelope = z.infer<typeof CollaborationAgentMessageEnvelopeSchema>;

export interface CollaborationAgentMessageReceivedEvent extends BaseEvent {
  eventType: typeof COLLABORATION_AGENT_MESSAGE_RECEIVED_ROUTING_KEY;
  aggregateType: 'agent_message';
  data: CollaborationAgentMessageEnvelope;
}

export interface AgentMessageAckedEvent extends BaseEvent {
  eventType: typeof COLLABORATION_AGENT_MESSAGE_ACKED_ROUTING_KEY;
  aggregateType: 'agent_message';
  data: CollaborationAgentMessageEnvelope;
}
