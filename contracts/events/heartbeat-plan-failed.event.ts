import type { BaseEvent } from './base-event.js';

/**
 * Worker：CEO Heartbeat 在 plan 阶段失败（结构化、可观测、可用于告警/降级策略）。
 *
 * 兼容性约束：
 * - 不改变现有心跳流水线事件；该事件为新增旁路信号
 * - data 字段尽量保持扁平，避免下游订阅方强依赖内部堆栈结构
 */
export interface HeartbeatPlanFailedEvent extends BaseEvent {
  eventType: 'heartbeat.plan.failed';
  aggregateType: 'company';
  data: {
    companyId: string;
    heartbeatId: string; // traceId/supervisorRunId
    phase: 'plan_exception';
    subordinateCount: number;
    failureType: 'heartbeat_plan';
    message: string;
    triggerSource?: string;
    triggerRef?: string;
    runKind?: 'heartbeat' | 'breakdown' | 'graph';
    metadata?: Record<string, unknown>;
  };
}

