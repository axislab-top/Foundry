import type { BaseEvent } from './base-event.js';

/** P16：与 warm pool 事件驱动 refill 对齐的负载（completed / failed 结构一致）。 */
export type RunnerExecutionLifecycleData = {
  companyId: string;
  skillExecutionId: string;
  executionTokenId?: string;
  success: boolean;
  reason?: string;
};

export interface RunnerExecutionCompletedEvent extends BaseEvent {
  eventType: 'runner.execution.completed';
  aggregateType: 'runner_execution';
  data: RunnerExecutionLifecycleData;
}

export interface RunnerExecutionFailedEvent extends BaseEvent {
  eventType: 'runner.execution.failed';
  aggregateType: 'runner_execution';
  data: RunnerExecutionLifecycleData;
}

export function runnerExecutionIdempotencyKey(params: {
  companyId: string;
  runId: string;
  skillExecutionId: string;
  outcome: 'completed' | 'failed';
}): string {
  return `${params.companyId}:${params.runId}:${params.skillExecutionId}:${params.outcome}`;
}
