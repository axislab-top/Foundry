import type { BaseEvent } from './base-event.js';
import { z } from 'zod';

/** MQ routing key（与 eventType 对齐） */
export const COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY =
  'collaboration.task-delegation.requested' as const;

/** W7：员工 Agent 主动提议子任务（桥接 CEO 审批或后续自动执行） */
export const EMPLOYEE_TASK_PROPOSE_ROUTING_KEY = 'employee.task.propose' as const;

export const EmployeeTaskProposeEnvelopeSchema = z.object({
  companyId: z.string().min(1),
  traceId: z.string().min(1),
  fromAgentId: z.string().min(1),
  parentTaskId: z.string().optional(),
  proposedTitle: z.string().min(1),
  proposedInputs: z.record(z.string(), z.unknown()).optional(),
  roomId: z.string().optional(),
  requestedAt: z.string().min(1),
  /** W10：员工自主发起（审计 / pending metadata 对齐） */
  employeeInitiated: z.boolean().optional(),
  mentionedAgentIds: z.array(z.string()).optional(),
  dynamicSubGraphTargets: z.array(z.string()).optional(),
  predictivePath: z.string().optional(),
});

export type EmployeeTaskProposeEnvelope = z.infer<typeof EmployeeTaskProposeEnvelopeSchema>;

export type TaskDomainStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'review'
  | 'awaiting_approval'
  | 'awaiting_supervision'
  | 'completed'
  | 'blocked'
  | 'cancelled'
  | 'paused';

export interface TaskCreatedEvent extends BaseEvent {
  eventType: 'task.created';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    parentId?: string;
    title: string;
    status: TaskDomainStatus;
    source?: 'manual' | 'collaboration_extract' | 'breakdown' | 'bootstrap' | 'autonomous';
    createdAt: string;
    /** 部门子目标所在群（`metadata.goalTargetRoomId`） */
    goalTargetRoomId?: string;
    assigneeId?: string | null;
    metadata?: Record<string, unknown>;
  };
}

export interface TaskUpdatedEvent extends BaseEvent {
  eventType: 'task.updated';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    changes: Record<string, unknown>;
    updatedAt: string;
  };
}

export interface TaskProgressUpdatedEvent extends BaseEvent {
  eventType: 'task.progress.updated';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    progress: number;
    status: TaskDomainStatus;
    updatedAt: string;
    title?: string;
    goalTargetRoomId?: string;
    assigneeId?: string | null;
    metadata?: Record<string, unknown>;
  };
}

export interface TaskCompletedEvent extends BaseEvent {
  eventType: 'task.completed';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    parentId?: string;
    completedAt: string;
    title?: string;
    status?: TaskDomainStatus;
    progress?: number;
    goalTargetRoomId?: string;
    assigneeId?: string | null;
    metadata?: Record<string, unknown>;
  };
}

export interface TaskAssignedEvent extends BaseEvent {
  eventType: 'task.assigned';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    assigneeType: 'agent' | 'organization_node';
    assigneeId: string;
    assignedByUserId?: string;
    assignedAt: string;
    note?: string | null;
  };
}

/** 任务进入阻塞（含原因） */
export interface TaskBlockedEvent extends BaseEvent {
  eventType: 'task.blocked';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    reason?: string;
    blockedAt: string;
  };
}

/** CEO / 汇总流水线：根任务或里程碑完成时生成的报告摘要 */
export interface TaskSummaryGeneratedEvent extends BaseEvent {
  eventType: 'task.summary.generated';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    summary: string;
    childTaskCount?: number;
    generatedAt: string;
  };
}

/** 部门/任务中心向主群提交汇总回报 */
export interface TaskReportGeneratedEvent extends BaseEvent {
  eventType: 'task.report.generated';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    parentTaskId?: string | null;
    roomId: string;
    sourceRoomId?: string | null;
    reportFlow?: string;
    reportedByUserId?: string | null;
    reportedAt: string;
    progress?: number;
    status?: string;
    escalationRequired?: boolean;
    blockedReason?: string | null;
  };
}

/** 任务升级 / 协调请求（治理回环） */
export interface TaskEscalationRequestedEvent extends BaseEvent {
  eventType: 'task.escalation.requested';
  aggregateType: 'task';
  data: {
    taskId: string;
    companyId: string;
    parentTaskId?: string | null;
    roomId: string;
    sourceRoomId?: string | null;
    reportFlow?: string;
    reportedByUserId?: string | null;
    reportedAt: string;
    progress?: number;
    status?: string;
    escalationRequired?: boolean;
    blockedReason?: string | null;
    targetDepartmentRoomId?: string | null;
    request?: string | null;
  };
}

/** 任务治理摘要（主管/CEO 房间系统消息，由 TaskGovernanceSummaryListener 消费） */
export interface TaskGovernanceSummaryGeneratedEvent extends BaseEvent {
  eventType: 'task.governance_summary.generated';
  aggregateType: 'task';
  data: {
    companyId: string;
    roomId: string;
    audience: 'supervisor' | 'director' | 'ceo';
    items: Array<{
      taskId: string;
      status: string;
      progress: number | null;
      blockedReason?: string | null;
      reportFlow: string;
      visibilityScope: 'department' | 'executive';
    }>;
    sourceEventId?: string | null;
  };
}

/** Worker / LangGraph：根据战略目标拆解子任务 */
export interface TaskBreakdownRequestedEvent extends BaseEvent {
  eventType: 'task.breakdown.requested';
  aggregateType: 'task';
  data: {
    companyId: string;
    rootTaskId?: string;
    goal: string;
    context?: Record<string, unknown>;
    requestedAt: string;
  };
}

/**
 * ACP / multi-agent：任务委派请求（与 @foundry/multi-agent-core `TaskDelegation` 字段对齐，供审计与 Worker 订阅）。
 */
export interface TaskDelegationRequestedEvent extends BaseEvent {
  eventType: typeof COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY;
  aggregateType: 'task';
  data: {
    companyId: string;
    traceId: string;
    fromAgentId: string;
    toAgentId: string;
    /** W9：部门 Director 自主拆解发起的委派（轻量审批门 metadata 对齐） */
    directorInitiated?: boolean;
    /** W10：员工 Agent 自主发起的委派 */
    employeeInitiated?: boolean;
    sessionId?: string;
    delegation: {
      taskId: string;
      parentTaskId?: string;
      ownerAgentId: string;
      executorAgentId: string;
      inputs: Record<string, unknown>;
      constraints?: {
        budgetCap?: number;
        slaSeconds?: number;
        maxRetries?: number;
      };
      dependsOn?: string[];
      status?: 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
    };
    requestedAt: string;
  };
}

/** W7：员工 Agent 提议新建子任务（审批门禁见 ApprovalGate / CEO runtime） */
export interface EmployeeTaskProposedEvent extends BaseEvent {
  eventType: typeof EMPLOYEE_TASK_PROPOSE_ROUTING_KEY;
  aggregateType: 'task';
  data: EmployeeTaskProposeEnvelope;
}

/** Heartbeat / 调度器：周期性扫描待执行任务 */
export interface TaskHeartbeatTickEvent extends BaseEvent {
  eventType: 'task.heartbeat.tick';
  aggregateType: 'company';
  data: {
    companyId: string;
    tickAt: string;
  };
}

/** 公司心跳 tick 处理失败（供告警 / 指标消费） */
export interface TaskHeartbeatFailedEvent extends BaseEvent {
  eventType: 'task.heartbeat.failed';
  aggregateType: 'company';
  data: {
    companyId: string;
    tickAt: string;
    errorSummary: string;
    failedAt: string;
    triggerSource?: 'nest_timer' | 'temporal';
  };
}

/** task_runs 进入 failed（CEO 心跳 / Temporal / nest_timer 等） */
export interface TaskRunFailedEvent extends BaseEvent {
  eventType: 'task.run.failed';
  aggregateType: 'task_run';
  data: {
    runId: string;
    companyId: string;
    errorSummary: string;
    failedAt: string;
    /** 从 execution logs 解析；CEO 级 run 可能为空 */
    taskId?: string;
  };
}

/** 部门编排父任务：全部子任务完成后进入 CEO Supervision 闸门（Worker 消费） */
export interface TaskSupervisionRequestedEvent extends BaseEvent {
  eventType: 'task.supervision.requested';
  aggregateType: 'task';
  data: {
    companyId: string;
    parentTaskId: string;
    requestedAt: string;
  };
}

export type TaskEvent =
  | TaskCreatedEvent
  | TaskAssignedEvent
  | TaskUpdatedEvent
  | TaskProgressUpdatedEvent
  | TaskCompletedEvent
  | TaskBlockedEvent
  | TaskSummaryGeneratedEvent
  | TaskReportGeneratedEvent
  | TaskEscalationRequestedEvent
  | TaskGovernanceSummaryGeneratedEvent
  | TaskBreakdownRequestedEvent
  | TaskDelegationRequestedEvent
  | EmployeeTaskProposedEvent
  | TaskHeartbeatTickEvent
  | TaskHeartbeatFailedEvent
  | TaskRunFailedEvent
  | TaskSupervisionRequestedEvent;

export interface TaskEventTopics {
  'task.created': TaskCreatedEvent;
  'task.assigned': TaskAssignedEvent;
  'task.updated': TaskUpdatedEvent;
  'task.progress.updated': TaskProgressUpdatedEvent;
  'task.completed': TaskCompletedEvent;
  'task.blocked': TaskBlockedEvent;
  'task.summary.generated': TaskSummaryGeneratedEvent;
  'task.report.generated': TaskReportGeneratedEvent;
  'task.escalation.requested': TaskEscalationRequestedEvent;
  'task.governance_summary.generated': TaskGovernanceSummaryGeneratedEvent;
  'task.breakdown.requested': TaskBreakdownRequestedEvent;
  'collaboration.task-delegation.requested': TaskDelegationRequestedEvent;
  'employee.task.propose': EmployeeTaskProposedEvent;
  'task.heartbeat.tick': TaskHeartbeatTickEvent;
  'task.heartbeat.failed': TaskHeartbeatFailedEvent;
  'task.run.failed': TaskRunFailedEvent;
  'task.supervision.requested': TaskSupervisionRequestedEvent;
}
