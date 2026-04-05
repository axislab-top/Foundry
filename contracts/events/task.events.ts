import type { BaseEvent } from './base-event.js';

export type TaskDomainStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'awaiting_approval'
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

/** Heartbeat / 调度器：周期性扫描待执行任务 */
export interface TaskHeartbeatTickEvent extends BaseEvent {
  eventType: 'task.heartbeat.tick';
  aggregateType: 'company';
  data: {
    companyId: string;
    tickAt: string;
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

export type TaskEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskProgressUpdatedEvent
  | TaskCompletedEvent
  | TaskBlockedEvent
  | TaskSummaryGeneratedEvent
  | TaskBreakdownRequestedEvent
  | TaskHeartbeatTickEvent
  | TaskRunFailedEvent;

export interface TaskEventTopics {
  'task.created': TaskCreatedEvent;
  'task.updated': TaskUpdatedEvent;
  'task.progress.updated': TaskProgressUpdatedEvent;
  'task.completed': TaskCompletedEvent;
  'task.blocked': TaskBlockedEvent;
  'task.summary.generated': TaskSummaryGeneratedEvent;
  'task.breakdown.requested': TaskBreakdownRequestedEvent;
  'task.heartbeat.tick': TaskHeartbeatTickEvent;
  'task.run.failed': TaskRunFailedEvent;
}
