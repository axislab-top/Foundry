import type { BaseEvent } from './base-event.js';

/** 与 `CollaborationHeartbeatCorrelationPayload`（collaboration.events）字段对齐，供 autonomous 域事件引用。 */
export type AutonomousHeartbeatCorrelationPayload = {
  heartbeatRunId: string;
  tickAt?: string;
  triggerSource?: string;
  runKind?: 'heartbeat' | 'breakdown' | 'graph';
  mainRoomId?: string | null;
  collaborationSurfaceRoomId?: string | null;
};

/** Worker：CEO LangGraph 单次 Heartbeat 流水线完成（可审计 / 下游可订阅） */
export interface AutonomousCeoHeartbeatCompletedEvent extends BaseEvent {
  eventType: 'autonomous.ceo.heartbeat.completed';
  aggregateType: 'company';
  data: {
    companyId: string;
    tickAt: string;
    runKind: 'heartbeat' | 'breakdown' | 'graph';
    reportPreview: string;
    threadId: string;
    runId?: string;
    /**
     * PR5：与协作群消息 metadata / `collaboration.intent.classified.*` 对齐的关联块；
     * `heartbeatRunId` 与 heartbeat 场景下历史字段 `runId` 一致。
     */
    heartbeatCorrelation?: AutonomousHeartbeatCorrelationPayload;
    directorStats?: {
      total: number;
      succeeded: number;
      failed: number;
    };
    directorReports?: Array<{
      directorAgentId: string;
      ok: boolean;
      messageId?: string;
      error?: string;
    }>;
    companySummary?: string;
    riskLevel?: 'low' | 'medium' | 'high';
  };
}

/** Worker：CEO 规划需人工审批（API 可转 WS approval:needed） */
export interface AutonomousCeoApprovalRequiredEvent extends BaseEvent {
  eventType: 'autonomous.ceo.approval.required';
  aggregateType: 'company';
  data: {
    companyId: string;
    roomId: string;
    agentId: string;
    reason: string;
    traceId: string;
    approvalId: string;
    metadata?: Record<string, unknown>;
  };
}

export type AutonomousCeoApprovalDecision = 'approved' | 'rejected' | 'modified';

/** Worker：CEO 审批通过后（用于恢复执行 / 放行任务） */
export interface AutonomousCeoApprovalApprovedEvent extends BaseEvent {
  eventType: 'autonomous.ceo.approval.approved';
  aggregateType: 'company';
  data: {
    companyId: string;
    approvalId: string;
    decisionAt: string;
    metadata?: Record<string, unknown>;
  };
}

/** Worker：CEO 审批拒绝后（用于终止 / 冻结后续执行） */
export interface AutonomousCeoApprovalRejectedEvent extends BaseEvent {
  eventType: 'autonomous.ceo.approval.rejected';
  aggregateType: 'company';
  data: {
    companyId: string;
    approvalId: string;
    decisionAt: string;
    metadata?: Record<string, unknown>;
  };
}

/** Worker：CEO 审批结果已决（approved/rejected/modified 的总事件） */
export interface AutonomousCeoApprovalResolvedEvent extends BaseEvent {
  eventType: 'autonomous.ceo.approval.resolved';
  aggregateType: 'company';
  data: {
    companyId: string;
    approvalId: string;
    decision: AutonomousCeoApprovalDecision;
    decisionAt: string;
    metadata?: Record<string, unknown>;
  };
}

export type AutonomousEvent =
  | AutonomousCeoHeartbeatCompletedEvent
  | AutonomousCeoApprovalRequiredEvent
  | AutonomousCeoApprovalApprovedEvent
  | AutonomousCeoApprovalRejectedEvent
  | AutonomousCeoApprovalResolvedEvent;

export interface AutonomousEventTopics {
  'autonomous.ceo.heartbeat.completed': AutonomousCeoHeartbeatCompletedEvent;
  'autonomous.ceo.approval.required': AutonomousCeoApprovalRequiredEvent;
  'autonomous.ceo.approval.approved': AutonomousCeoApprovalApprovedEvent;
  'autonomous.ceo.approval.rejected': AutonomousCeoApprovalRejectedEvent;
  'autonomous.ceo.approval.resolved': AutonomousCeoApprovalResolvedEvent;
}
