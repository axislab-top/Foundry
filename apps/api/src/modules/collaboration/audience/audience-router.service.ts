import { Injectable } from '@nestjs/common';
import type { ChatRoom } from '../entities/chat-room.entity.js';
import type { AudienceDecision } from './audience-decision.types.js';
import type { MessageIntentCategory } from '../services/message-processing.types.js';

@Injectable()
export class AudienceRouterService {
  decide(input: {
    companyId: string;
    room: ChatRoom;
    messageId: string;
    messageCategory: MessageIntentCategory | 'upgrade_request' | 'execution_detail' | 'decision';
    metadata: Record<string, unknown>;
  }): AudienceDecision {
    const mentionedAgentIds = this.stringArray(input.metadata.mentionedAgentIds);
    const mentionedNodeIds = this.stringArray(input.metadata.mentionedNodeIds);
    const mentionedDepartmentSlugs = this.stringArray(input.metadata.mentionedDepartmentSlugs);
    const base = {
      companyId: input.companyId,
      roomId: input.room.id,
      messageId: input.messageId,
      roomType: input.room.roomType,
      messageCategory: input.messageCategory,
    };

    if (mentionedAgentIds.length === 1) {
      return {
        ...base,
        responderType: 'employee_agent',
        targetAgentIds: mentionedAgentIds,
        targetNodeIds: mentionedNodeIds,
        targetDepartmentSlugs: mentionedDepartmentSlugs,
        responseMode: 'direct_reply',
        confidence: 0.95,
        reasons: ['single_agent_mention'],
        source: 'mention',
      };
    }

    if (mentionedAgentIds.length > 1 || mentionedDepartmentSlugs.length > 1 || mentionedNodeIds.length > 1) {
      return {
        ...base,
        responderType: mentionedDepartmentSlugs.length > 1 || mentionedNodeIds.length > 1 ? 'multi_department' : 'employee_agent',
        targetAgentIds: mentionedAgentIds,
        targetNodeIds: mentionedNodeIds,
        targetDepartmentSlugs: mentionedDepartmentSlugs,
        responseMode: 'discussion',
        confidence: 0.9,
        reasons: ['multiple_targets_mentioned'],
        source: 'mention',
      };
    }

    if (input.room.roomType === 'main') {
      return {
        ...base,
        responderType: 'ceo',
        targetAgentIds: [],
        targetNodeIds: [],
        targetDepartmentSlugs: [],
        responseMode: input.messageCategory === 'coordination' || input.messageCategory === 'upgrade_request' ? 'handoff' : 'direct_reply',
        confidence: 0.78,
        reasons: ['main_room_default_ceo'],
        source: 'room_default',
      };
    }

    if (input.room.roomType === 'department') {
      return {
        ...base,
        responderType: 'department_head',
        targetAgentIds: [],
        targetNodeIds: input.room.organizationNodeId ? [input.room.organizationNodeId] : [],
        targetDepartmentSlugs: mentionedDepartmentSlugs,
        responseMode: input.messageCategory === 'upgrade_request' ? 'handoff' : 'direct_reply',
        confidence: 0.82,
        reasons: ['department_room_default_head'],
        source: 'room_default',
      };
    }

    if (input.room.roomType === 'task') {
      return {
        ...base,
        responderType: 'employee_agent',
        targetAgentIds: mentionedAgentIds,
        targetNodeIds: mentionedNodeIds,
        targetDepartmentSlugs: mentionedDepartmentSlugs,
        responseMode: 'direct_reply',
        confidence: 0.72,
        reasons: ['task_room_default_assignee'],
        source: 'room_default',
      };
    }

    return {
      ...base,
      responderType: 'none',
      targetAgentIds: [],
      targetNodeIds: [],
      targetDepartmentSlugs: [],
      responseMode: 'silent',
      confidence: 0.5,
      reasons: ['custom_room_no_default_responder'],
      source: 'room_default',
    };
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }
}
