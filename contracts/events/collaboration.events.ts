/**
 * 协作 / 群聊领域事件
 */

import type { BaseEvent } from './base-event.js';

export type CollaborationSenderType = 'human' | 'agent';
export type CollaborationMessageType =
  | 'text'
  | 'system'
  | 'tool_call'
  | 'stream_chunk';

export interface CollaborationDepartmentJoinedEvent extends BaseEvent {
  eventType: 'collaboration.department.joined';
  aggregateType: 'chat_room';
  data: {
    roomId: string;
    organizationNodeId: string;
    scope: string;
    actorUserId: string;
    agentIds: string[];
    joinedAt: string;
  };
}

export interface CollaborationMessageReceivedEvent extends BaseEvent {
  eventType: 'collaboration.message.received';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    seq: string;
    senderType: CollaborationSenderType;
    senderId: string;
    messageType: CollaborationMessageType;
    contentPreview: string;
    createdAt: string;
    /** 解析后的 @agent id 列表（若有） */
    mentionedAgentIds?: string[];
    threadId?: string | null;
    traceId?: string | null;
    collaborationMode?: string | null;
  };
}

/** Worker：意图分类结果（可订阅审计 / 前端调试） */
export interface CollaborationIntentClassifiedEvent extends BaseEvent {
  eventType: 'collaboration.intent.classified';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    mode: 'discussion' | 'direct' | 'execution' | 'approval';
    confidence: number;
    mentionedAgentIds: string[];
    classifiedAt: string;
  };
}

/** CEO 对单条消息的结构化路由决策（审计 / 回放） */
export interface CollaborationCeoDecisionRecordedEvent extends BaseEvent {
  eventType: 'collaboration.ceo.decision.recorded';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    mode: 'discussion' | 'direct' | 'execution' | 'approval';
    confidence: number;
    mentionedAgentIds: string[];
    actionSummary?: string;
    requiresHumanApproval?: boolean;
    approvalTitle?: string | null;
    nextStep?: string;
    modelUsed?: string;
    latencyMs?: number;
    cacheHit?: boolean;
    rawDecisionJson?: string;
    decidedAt: string;
  };
}

/** 讨论线程收敛 */
export interface CollaborationDiscussionConvergedEvent extends BaseEvent {
  eventType: 'collaboration.discussion.converged';
  aggregateType: 'discussion_thread';
  data: {
    roomId: string;
    threadId: string;
    summary?: string;
    convergedAt: string;
  };
}

/** Agent 提议切换房间协作模式 */
export interface CollaborationModeProposedEvent extends BaseEvent {
  eventType: 'collaboration.mode.proposed';
  aggregateType: 'chat_room';
  data: {
    roomId: string;
    proposedByAgentId: string;
    targetMode: 'discussion' | 'direct' | 'execution' | 'approval_wait';
    reason: string;
    sourceMessageId: string;
    proposedAt: string;
  };
}

/** 房间协作模式已变更（含 CEO 仲裁与用户手动） */
export interface CollaborationModeChangedEvent extends BaseEvent {
  eventType: 'collaboration.mode.changed';
  aggregateType: 'chat_room';
  data: {
    roomId: string;
    previousMode: string | null;
    newMode: string;
    reason?: string;
    changedAt: string;
  };
}

/** 成员进入房间（含重新加入） */
export interface CollaborationRoomMemberJoinedEvent extends BaseEvent {
  eventType: 'collaboration.room.member.joined';
  aggregateType: 'room_member';
  data: {
    roomId: string;
    memberType: CollaborationSenderType;
    memberId: string;
    joinedAt: string;
  };
}

/** 成员离开房间（软删除 left_at） */
export interface CollaborationRoomMemberLeftEvent extends BaseEvent {
  eventType: 'collaboration.room.member.left';
  aggregateType: 'room_member';
  data: {
    roomId: string;
    memberType: CollaborationSenderType;
    memberId: string;
    leftAt: string;
  };
}

/** 请求生成群聊总结（Worker 消费后写入 Memory / 返回摘要） */
export interface CollaborationRoomSummaryRequestedEvent extends BaseEvent {
  eventType: 'collaboration.room.summary.requested';
  aggregateType: 'chat_room';
  data: {
    roomId: string;
    requestedByUserId: string;
    mode: 'manual' | 'scheduled';
    requestedAt: string;
  };
}

export interface CollaborationRoomSummaryGeneratedEvent extends BaseEvent {
  eventType: 'collaboration.room.summary.generated';
  aggregateType: 'chat_room';
  data: {
    roomId: string;
    summary: string;
    messageCount: number;
    generatedAt: string;
  };
}

/** 从对话中抽取的任务候选（TasksModule 可订阅落地） */
export interface CollaborationTaskExtractedEvent extends BaseEvent {
  eventType: 'collaboration.task.extracted';
  aggregateType: 'chat_room';
  data: {
    roomId: string;
    sourceMessageId: string;
    title: string;
    description?: string;
    extractedAt: string;
  };
}

/** @ 提及解析结果，供 Agent 路由（与 message.received 配合） */
export interface CollaborationMentionRoutedEvent extends BaseEvent {
  eventType: 'collaboration.mention.routed';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    mentionedAgentIds: string[];
    routedAt: string;
  };
}

/** 请求将消息写入向量记忆（MemoryModule RAG） */
export interface CollaborationMemoryIndexRequestedEvent extends BaseEvent {
  eventType: 'collaboration.memory.index.requested';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    requestedAt: string;
  };
}

/** 请求对会话记忆做 consolidation（按消息阈值/时间窗口触发） */
export interface CollaborationMemoryConsolidateRequestedEvent extends BaseEvent {
  eventType: 'collaboration.memory.consolidate.requested';
  aggregateType: 'chat_room';
  data: {
    roomId: string;
    trigger:
      | 'threshold'
      | 'scheduled'
      | 'manual'
      | 'backfill';
    sourceMessageId?: string;
    messageSeq?: string;
    requestedAt: string;
  };
}

export type CollaborationEvent =
  | CollaborationMessageReceivedEvent
  | CollaborationIntentClassifiedEvent
  | CollaborationCeoDecisionRecordedEvent
  | CollaborationDiscussionConvergedEvent
  | CollaborationModeProposedEvent
  | CollaborationModeChangedEvent
  | CollaborationDepartmentJoinedEvent
  | CollaborationRoomMemberJoinedEvent
  | CollaborationRoomMemberLeftEvent
  | CollaborationRoomSummaryRequestedEvent
  | CollaborationRoomSummaryGeneratedEvent
  | CollaborationTaskExtractedEvent
  | CollaborationMentionRoutedEvent
  | CollaborationMemoryIndexRequestedEvent
  | CollaborationMemoryConsolidateRequestedEvent;

export interface CollaborationEventTopics {
  'collaboration.message.received': CollaborationMessageReceivedEvent;
  'collaboration.intent.classified': CollaborationIntentClassifiedEvent;
  'collaboration.ceo.decision.recorded': CollaborationCeoDecisionRecordedEvent;
  'collaboration.discussion.converged': CollaborationDiscussionConvergedEvent;
  'collaboration.mode.proposed': CollaborationModeProposedEvent;
  'collaboration.mode.changed': CollaborationModeChangedEvent;
  'collaboration.department.joined': CollaborationDepartmentJoinedEvent;
  'collaboration.room.member.joined': CollaborationRoomMemberJoinedEvent;
  'collaboration.room.member.left': CollaborationRoomMemberLeftEvent;
  'collaboration.room.summary.requested': CollaborationRoomSummaryRequestedEvent;
  'collaboration.room.summary.generated': CollaborationRoomSummaryGeneratedEvent;
  'collaboration.task.extracted': CollaborationTaskExtractedEvent;
  'collaboration.mention.routed': CollaborationMentionRoutedEvent;
  'collaboration.memory.index.requested': CollaborationMemoryIndexRequestedEvent;
  'collaboration.memory.consolidate.requested': CollaborationMemoryConsolidateRequestedEvent;
}
