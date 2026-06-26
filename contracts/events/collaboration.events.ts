/**
 * 协作 / 群聊领域事件
 */

import type { CeoAlignmentMetadata, CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { BaseEvent } from './base-event.js';
import type { AgentMessageAckedEvent, CollaborationAgentMessageReceivedEvent } from './agent-message.events.js';

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
    /** 原始会话 ID（ACP sessionId 等），用于房间映射审计。 */
    sourceSessionId?: string;
    seq: string;
    senderType: CollaborationSenderType;
    senderId: string;
    messageType: CollaborationMessageType;
    contentPreview: string;
    createdAt: string;
    /** 解析后的 @agent id 列表（若有） */
    mentionedAgentIds?: string[];
    /** 解析后的 @组织节点 id 列表（若有） */
    mentionedNodeIds?: string[];
    threadId?: string | null;
    traceId?: string | null;
    collaborationMode?: string | null;
  };
}

/**
 * W12：协作消息领域入站（与 {@link CollaborationMessageReceivedEvent} 载荷同构）。
 * `AUTONOMOUS_EVENT_BUS_V2_ENABLED=true` 时 API 仅发布此路由键；Worker 与本队列绑定 legacy + domain 双路由避免订阅分裂。
 * Legacy：`collaboration.message.received`（默认关闭 domain 总线时仍在位）。
 */
export const COLLABORATION_CHAT_MESSAGE_INGESTED_V2_ROUTING_KEY =
  'collaboration.chat.message.ingested.v2' as const;

export interface CollaborationChatMessageIngestedV2Event extends BaseEvent {
  eventType: typeof COLLABORATION_CHAT_MESSAGE_INGESTED_V2_ROUTING_KEY;
  aggregateType: 'chat_message';
  data: CollaborationMessageReceivedEvent['data'];
}

/** Worker：意图分类结果（可订阅审计 / 前端调试） */
export interface CollaborationIntentClassifiedEvent extends BaseEvent {
  eventType: 'collaboration.intent.classified';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    mode: 'discussion' | 'direct' | 'execution' | 'approval';
    originalMode?: string;
    confidence: number;
    mentionedAgentIds: string[];
    mentionIntentRoute?: 'draft-mention' | 'confirmed-execution' | 'idle-confirm';
    userIntentType?: 'qa' | 'delegate' | 'discussion' | 'execution' | 'approval' | 'unknown';
    responseOwner?: 'ceo' | 'target_agent' | 'multiple_agents' | 'system';
    targetAgentIds?: string[];
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
    originalMode?: string;
    confidence: number;
    mentionedAgentIds: string[];
    mentionIntentRoute?: 'draft-mention' | 'confirmed-execution' | 'idle-confirm';
    userIntentType?: 'qa' | 'delegate' | 'discussion' | 'execution' | 'approval' | 'unknown';
    responseOwner?: 'ceo' | 'target_agent' | 'multiple_agents' | 'system';
    targetAgentIds?: string[];
    actionSummary?: string;
    requiresHumanApproval?: boolean;
    approvalTitle?: string | null;
    nextStep?: string;
    routeSignal?: 'HEAVY_GRAPH' | null;
    reasoning?: string;
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

/** Worker 自动把提及目标拉入房间（用于审计与排障） */
export interface CollaborationMemberAutoJoinedEvent extends BaseEvent {
  eventType: 'collaboration.member.auto_joined';
  aggregateType: 'chat_room';
  data: {
    roomId: string;
    sourceMessageId: string;
    targetAgentId: string;
    organizationNodeId?: string | null;
    strategy: 'organization_node' | 'agent_direct';
    joinedAt: string;
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

/** 部门强制升级裁断：快速风险通道（公司巡检可立即感知） */
export interface DepartmentEscalationForcedEvent extends BaseEvent {
  eventType: 'department.escalation.forced';
  aggregateType: 'department';
  data: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    ceoAgentId: string;
    departmentSlug: string;
    taskId?: string;
    reason: string;
    forcedAt: string;
    priority: 'high';
  };
}

/**
 * PR5/W4：Autonomous CEO heartbeat 单次运行与协作主群/部门群事件的 join 键。
 * 与 `autonomous.ceo.heartbeat.completed` 的 `heartbeatCorrelation` 对齐。
 */
export interface CollaborationHeartbeatCorrelationPayload {
  heartbeatRunId: string;
  tickAt?: string;
  triggerSource?: string;
  runKind?: 'heartbeat' | 'breakdown' | 'graph';
  /** 公司主协作房主群 roomId（findMain） */
  mainRoomId?: string | null;
  /** CEO 汇报实际落到的房间（@ 场景可为部门群） */
  collaborationSurfaceRoomId?: string | null;
}

/**
 * Worker (v2): Intent classified with full v2 payload for audit/replay.
 */
export interface CollaborationIntentClassifiedV2Event extends BaseEvent {
  eventType: 'collaboration.intent.classified.v2';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    traceId: string;
    /** 当前处理的用户消息（通常等于 messageId） */
    turnMessageId?: string;
    /** 战略/规划锚点；历史字段 `traceId` 若表示路由根时与此不同 */
    planAnchorMessageId?: string;
    routingRootMessageId?: string;
    runId?: string;
    intentDecision: Record<string, unknown>;
    /** Optional: concise result summary (planning/distribution/execution started). */
    resultSummary?: string;
    routePath: string;
    executionMode?: 'sync' | 'async';
    classifiedAt: string;
    /** PR5：若用户消息或上游携带了 heartbeat 关联，则透传便于审计 join */
    heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
  };
}

/**
 * 2026.1：结构化统一意图决策（Single Source of Truth），与 legacy `collaboration.intent.classified.v2` 双发过渡。
 * 消费者优先订阅本事件；若无则回退解析 v2.payload.intentDecision（松散 JSON）。
 */
export interface CollaborationIntentClassifiedV20261Payload {
  schemaVersion: '2026.1' | '2026.2';
  originalMessageId: string;
  roomId: string;
  companyId: string;
  traceId: string;
  turnMessageId?: string;
  planAnchorMessageId?: string;
  routingRootMessageId?: string;
  runId?: string;
  /** 房间类型（主群 / 部门房等），便于下游分流与面板维度 */
  roomType: string;
  /** 消息类别（如 task_publish），与 pipeline 输入对齐；无则 null */
  messageCategory: string | null;
  /**
   * 计划废弃本事件形态或 dual-publish 的 UTC ISO8601 时间；未设定时可省略。
   * 供订阅方规划迁移（例如仅保留 v2026.1）。
   */
  deprecatedAt?: string;
  intentDecision: CollaborationIntentDecisionV20261;
  /** 与下游 routePath / IntentDecision（蓝图信封）对齐字段 */
  legacyMapping?: {
    routePath: string;
    legacyIntentType?: string;
    legacyConfidence?: number;
    classifier?: string;
  };
  occurredAt: string;
  /** PR5：与 autonomous heartbeat 关联（可选） */
  heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
}

export interface CollaborationIntentClassifiedV20261Event extends BaseEvent {
  eventType: 'collaboration.intent.classified.v2026_1';
  aggregateType: 'chat_message';
  data: CollaborationIntentClassifiedV20261Payload;
}

/** WebSocket realtime：接话人思考态（不落库，经 Redis collab:notify → Gateway）。 */
export type CollaborationResponderThinkingStatus = 'routing' | 'thinking' | 'idle';

export type CollaborationResponderCeoLayer = 'L1' | 'L2' | 'L3';

export interface CollaborationResponderThinkingPayload {
  sourceMessageId: string;
  status: CollaborationResponderThinkingStatus;
  responderAgentIds: string[];
  routePath?: string;
  intentType?: string;
  ceoLayer?: CollaborationResponderCeoLayer;
  roomType?: 'main' | 'department';
  runId?: string;
  traceId?: string;
  startedAt: string;
  endedAt?: string;
}

/**
 * Worker (v2): Heavy execution completed with output summary.
 */
export interface CollaborationExecutionCompletedV2Event extends BaseEvent {
  eventType: 'collaboration.execution.completed.v2';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    traceId: string;
    turnMessageId?: string;
    planAnchorMessageId?: string;
    routingRootMessageId?: string;
    runId?: string;
    temporalWorkflowId: string;
    executionMode?: 'sync' | 'async';
    heavyExecutionOutput: Record<string, unknown>;
    completedAt: string;
  };
}

/**
 * Worker (v2): execution state transition for task lifecycle audit.
 */
export type CollaborationExecutionStage =
  | 'proposed'
  | 'approved'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'reviewed';

export interface CollaborationExecutionStateChangedV2Event extends BaseEvent {
  eventType: 'collaboration.execution.state_changed.v2';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    traceId: string;
    turnMessageId?: string;
    planAnchorMessageId?: string;
    routingRootMessageId?: string;
    runId?: string;
    routePath: string;
    stage: CollaborationExecutionStage;
    executionMode?: 'sync' | 'async';
    changedAt: string;
    heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
  };
}

/**
 * 单次发布完整执行状态链，替代同 trace 上多次 `collaboration.execution.state_changed.v2`。
 */
export interface CollaborationExecutionLifecycleV1Event extends BaseEvent {
  eventType: 'collaboration.execution.lifecycle.v1';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    traceId: string;
    turnMessageId?: string;
    planAnchorMessageId?: string;
    routingRootMessageId?: string;
    runId?: string;
    routePath: string;
    stages: CollaborationExecutionStage[];
    terminalStage: CollaborationExecutionStage;
    executionMode?: 'sync' | 'async';
    changedAt: string;
    heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
  };
}

/**
 * Worker (v2): message processing failed (for alerting).
 */
export interface CollaborationMessageProcessFailedV2Event extends BaseEvent {
  eventType: 'collaboration.message.process_failed.v2';
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    traceId?: string;
    error: string;
    failedAt: string;
  };
}

/** W11：跨部门协调请求（Director / 员工路径触发 → L2 Graph） */
export const CROSS_DEPARTMENT_COORDINATION_REQUESTED_ROUTING_KEY =
  'cross-department.coordination.requested' as const;

/** W11：跨部门协调完成（L2 aggregate 后出站） */
export const CROSS_DEPARTMENT_COORDINATION_COMPLETED_ROUTING_KEY =
  'cross-department.coordination.completed' as const;

/** W10：员工 Agent 房间内 @ 已被 Worker 自主路径处理（观测 / 下游订阅） */
export const AGENT_MENTION_HANDLED_ROUTING_KEY = 'agent.mention.handled' as const;

export interface CrossDepartmentCoordinationRequestedEvent extends BaseEvent {
  eventType: typeof CROSS_DEPARTMENT_COORDINATION_REQUESTED_ROUTING_KEY;
  aggregateType: 'coordination';
  data: {
    companyId: string;
    traceId: string;
    roomId: string;
    messageId: string;
    /** director_autonomous | employee_autonomous | mixed */
    sourceSurface: string;
    mentionedNodeIds: string[];
    mentionedAgentIds: string[];
    targetDepartmentNodeIds: string[];
    requestedAt: string;
    contentPreview: string;
  };
}

export interface CrossDepartmentCoordinationCompletedEvent extends BaseEvent {
  eventType: typeof CROSS_DEPARTMENT_COORDINATION_COMPLETED_ROUTING_KEY;
  aggregateType: 'coordination';
  data: {
    companyId: string;
    traceId: string;
    roomId: string;
    messageId: string;
    sourceSurface: string;
    reportDraftPreview: string;
    completedAt: string;
  };
}

export interface AgentMentionHandledEvent extends BaseEvent {
  eventType: typeof AGENT_MENTION_HANDLED_ROUTING_KEY;
  aggregateType: 'chat_message';
  data: {
    companyId: string;
    roomId: string;
    messageId: string;
    fromAgentId: string;
    mentionedAgentIds: string[];
    handledSurfaces: Array<'employee_autonomous_propose' | 'employee_autonomous_delegation' | 'employee_autonomous_skill'>;
    traceId: string;
    occurredAt: string;
    dynamicSubGraphTargets?: string[];
    predictivePath?: string;
  };
}

/** 主群讨论模式：事件驱动多 agent 有界轮次。
 * 路由键统一为 {@link COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY}：`roundIndex===0` 表示本会话首轮调度，
 * 后续步进复用同一键发布（避免额外 exchange 绑定）；消费者通过 payload 区分轮次。
 */
export const COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY =
  'collaboration.main-room.roundtable.step' as const;

/** Worker 主群 Replay delegate 完成：API SSOT 写入 ReplayDecision / ExecutionIntake。 */
export const COLLABORATION_REPLAY_DELEGATE_COMPLETED_ROUTING_KEY =
  'collaboration.replay.delegate.completed' as const;

export type CollaborationReplayDecisionKind =
  | 'continue_conversation'
  | 'ask_clarification'
  | 'start_discussion'
  | 'summarize_discussion'
  | 'propose_execution'
  | 'prepare_task_draft'
  | 'confirm_execution'
  | 'dispatch_to_departments'
  | 'no_op';

export interface CollaborationReplayExecutionHint {
  taskLike: boolean;
  expectedOutput?: string;
  acceptanceCriteria?: string[];
  deadlineHint?: string;
}

export interface CollaborationReplayDelegateCompletedEvent extends BaseEvent {
  eventType: typeof COLLABORATION_REPLAY_DELEGATE_COMPLETED_ROUTING_KEY;
  aggregateType: 'chat_message';
  data: {
    messageId: string;
    roomId: string;
    traceId: string;
    authorizationOutcome: 'authorized' | 'propose' | 'light_reply' | 'bypass';
    replayDecisionKind: CollaborationReplayDecisionKind;
    draftGoalSummary?: string | null;
    ceoAlignment?: CeoAlignmentMetadata;
    executionHint?: CollaborationReplayExecutionHint;
    requiresUserConfirmation: boolean;
    targetDepartmentSlugs: string[];
    targetAgentIds: string[];
    summary: string;
    rationale: string[];
    routeBypass?:
      | 'dispatch_plan_heavy'
      | 'explicit_directed'
      | 'direct_summon_unresolved'
      | null;
    completedAt: string;
  };
}

export interface CollaborationMainRoomRoundtableStepEvent extends BaseEvent {
  eventType: typeof COLLABORATION_MAIN_ROOM_ROUNDTABLE_STEP_ROUTING_KEY;
  aggregateType: 'chat_room';
  data: {
    companyId: string;
    roomId: string;
    sessionId: string;
    anchorMessageId: string;
    humanSenderId: string;
    humanMessageContent: string;
    participantAgentIds: string[];
    roundIndex: number;
    maxRounds: number;
    priorReplies: Array<{ agentId: string; preview: string }>;
    threadId?: string | null;
    requestedAt: string;
  };
}

/** Agent 通过 `message_send_to_agent` 工具点名同事后主群异步唤醒目标 Agent 回复。 */
export const COLLABORATION_AGENT_PEER_SUMMON_REQUESTED_ROUTING_KEY =
  'collaboration.agent-peer-summon.requested' as const;

export interface CollaborationAgentPeerSummonRequestedEvent extends BaseEvent {
  eventType: typeof COLLABORATION_AGENT_PEER_SUMMON_REQUESTED_ROUTING_KEY;
  aggregateType: 'chat_message';
  data: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    senderAgentId: string;
    targetAgentId: string;
    contentPreview: string;
    summonTargetAgentIds: string[];
    threadId?: string | null;
    anchorMessageId?: string | null;
    traceId: string;
    requestedAt: string;
  };
}

export type CollaborationEvent =
  | CollaborationMessageReceivedEvent
  | CollaborationChatMessageIngestedV2Event
  | CollaborationIntentClassifiedEvent
  | CollaborationCeoDecisionRecordedEvent
  | CollaborationDiscussionConvergedEvent
  | CollaborationModeProposedEvent
  | CollaborationModeChangedEvent
  | CollaborationDepartmentJoinedEvent
  | CollaborationRoomMemberJoinedEvent
  | CollaborationRoomMemberLeftEvent
  | CollaborationMemberAutoJoinedEvent
  | CollaborationRoomSummaryRequestedEvent
  | CollaborationRoomSummaryGeneratedEvent
  | CollaborationTaskExtractedEvent
  | CollaborationMentionRoutedEvent
  | CollaborationMemoryIndexRequestedEvent
  | CollaborationMemoryConsolidateRequestedEvent
  | DepartmentEscalationForcedEvent
  | CollaborationIntentClassifiedV2Event
  | CollaborationIntentClassifiedV20261Event
  | CollaborationExecutionCompletedV2Event
  | CollaborationExecutionStateChangedV2Event
  | CollaborationExecutionLifecycleV1Event
  | CollaborationMessageProcessFailedV2Event
  | CollaborationAgentMessageReceivedEvent
  | AgentMessageAckedEvent
  | AgentMentionHandledEvent
  | CrossDepartmentCoordinationRequestedEvent
  | CrossDepartmentCoordinationCompletedEvent
  | CollaborationMainRoomRoundtableStepEvent
  | CollaborationReplayDelegateCompletedEvent
  | CollaborationAgentPeerSummonRequestedEvent;

export interface CollaborationEventTopics {
  'collaboration.message.received': CollaborationMessageReceivedEvent;
  'collaboration.chat.message.ingested.v2': CollaborationChatMessageIngestedV2Event;
  'collaboration.agent-message.received': CollaborationAgentMessageReceivedEvent;
  'collaboration.agent-message.acked': AgentMessageAckedEvent;
  'collaboration.intent.classified': CollaborationIntentClassifiedEvent;
  'collaboration.intent.classified.v2': CollaborationIntentClassifiedV2Event;
  'collaboration.intent.classified.v2026_1': CollaborationIntentClassifiedV20261Event;
  'collaboration.ceo.decision.recorded': CollaborationCeoDecisionRecordedEvent;
  'collaboration.execution.completed.v2': CollaborationExecutionCompletedV2Event;
  'collaboration.execution.state_changed.v2': CollaborationExecutionStateChangedV2Event;
  'collaboration.execution.lifecycle.v1': CollaborationExecutionLifecycleV1Event;
  'collaboration.message.process_failed.v2': CollaborationMessageProcessFailedV2Event;
  'collaboration.discussion.converged': CollaborationDiscussionConvergedEvent;
  'collaboration.mode.proposed': CollaborationModeProposedEvent;
  'collaboration.mode.changed': CollaborationModeChangedEvent;
  'collaboration.department.joined': CollaborationDepartmentJoinedEvent;
  'collaboration.room.member.joined': CollaborationRoomMemberJoinedEvent;
  'collaboration.room.member.left': CollaborationRoomMemberLeftEvent;
  'collaboration.member.auto_joined': CollaborationMemberAutoJoinedEvent;
  'collaboration.room.summary.requested': CollaborationRoomSummaryRequestedEvent;
  'collaboration.room.summary.generated': CollaborationRoomSummaryGeneratedEvent;
  'collaboration.task.extracted': CollaborationTaskExtractedEvent;
  'collaboration.mention.routed': CollaborationMentionRoutedEvent;
  'collaboration.memory.index.requested': CollaborationMemoryIndexRequestedEvent;
  'collaboration.memory.consolidate.requested': CollaborationMemoryConsolidateRequestedEvent;
  'department.escalation.forced': DepartmentEscalationForcedEvent;
  'agent.mention.handled': AgentMentionHandledEvent;
  'cross-department.coordination.requested': CrossDepartmentCoordinationRequestedEvent;
  'cross-department.coordination.completed': CrossDepartmentCoordinationCompletedEvent;
  'collaboration.main-room.roundtable.step': CollaborationMainRoomRoundtableStepEvent;
  'collaboration.replay.delegate.completed': CollaborationReplayDelegateCompletedEvent;
  'collaboration.agent-peer-summon.requested': CollaborationAgentPeerSummonRequestedEvent;
}
