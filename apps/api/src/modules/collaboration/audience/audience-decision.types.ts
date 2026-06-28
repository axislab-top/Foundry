import type { ChatRoomType } from '../entities/chat-room.entity.js';

export type AudienceResponderType =
  | 'ceo'
  | 'department_head'
  | 'employee_agent'
  | 'multi_department'
  | 'system'
  | 'none';

export type AudienceResponseMode =
  | 'direct_reply'
  | 'discussion'
  | 'handoff'
  | 'ask_clarification'
  | 'silent';

export type AudienceDecisionSource =
  | 'mention'
  | 'room_default'
  | 'role_policy'
  | 'replay_hint'
  | 'manual';

export interface AudienceDecision {
  companyId: string;
  roomId: string;
  messageId: string;
  roomType: ChatRoomType;
  responderType: AudienceResponderType;
  targetAgentIds: string[];
  targetNodeIds: string[];
  targetDepartmentSlugs: string[];
  responseMode: AudienceResponseMode;
  confidence: number;
  reasons: string[];
  source: AudienceDecisionSource;
  messageCategory: string;
}
