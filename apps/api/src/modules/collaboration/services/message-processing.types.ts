import type { ChatMessage, ChatMessageType, ChatSenderType } from '../entities/chat-message.entity.js';

export type MessageProcessingAction =
  | 'extract_task_candidates'
  | 'route_mentions'
  | 'request_memory_index'
  | 'publish_received';

export type MessageIntentCategory =
  | 'chat'
  | 'broadcast'
  | 'task_publish'
  | 'report'
  | 'approval'
  | 'coordination'
  | 'upgrade_request'
  | 'execution_detail'
  | 'decision'
  | 'unknown';

export interface MessageEnvelope {
  companyId: string;
  message: ChatMessage;
  senderType: ChatSenderType;
  messageType: ChatMessageType;
  metadata: Record<string, unknown>;
  content: string;
}

export type MessageProcessingMode =
  | 'conversation'
  | 'discussion'
  | 'task_execution'
  | 'coordination'
  | 'approval'
  | 'report'
  | 'memory_lookup'
  | 'unknown';

export type MessageUserFacingStage =
  | 'received'
  | 'understanding'
  | 'conversation_only'
  | 'discussion_only'
  | 'task_candidate_detected'
  | 'coordination_candidate_detected'
  | 'approval_candidate_detected'
  | 'report_detected'
  | 'memory_lookup_detected';

export interface MessageSemanticProfile {
  messageKind:
    | 'human_text'
    | 'agent_text'
    | 'system_event'
    | 'stream_chunk'
    | 'control_message'
    | 'noise';
  intentCategory: MessageIntentCategory;
  processingMode: MessageProcessingMode;
  userFacingStage: MessageUserFacingStage;
  contentLength: number;
  hasMentions: boolean;
  hasTaskIntent: boolean;
  isIndexable: boolean;
  isEligibleForReceivedEvent: boolean;
  reasons: string[];
}

export interface MessageActionDecision {
  action: MessageProcessingAction;
  allow: boolean;
  reasonCodes: string[];
}
