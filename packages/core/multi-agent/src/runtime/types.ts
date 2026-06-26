import type { AgentMessage } from '../contracts/agent-message.contract.js';
import type { RuntimeContext } from './runtime-context.js';
import type { SupervisionResult } from '../supervision/supervision-action.js';

export interface AgentRuntimeOptions {
  enableSupervision?: boolean;
  maxRetries?: number;
  defaultSlaSeconds?: number;
}

export interface TaskDelegationRequest {
  taskId: string;
  executorAgentId: string;
  inputs: Record<string, unknown>;
  parentTaskId?: string;
  constraints?: {
    budgetCap?: number;
    slaSeconds?: number;
    maxRetries?: number;
  };
  dependsOn?: string[];
}

export interface DispatchResult {
  message: AgentMessage;
}

export interface ExecutionResult<TData = unknown> {
  success: boolean;
  data?: TData;
  error?: Error;
  traceEvents: Record<string, unknown>[];
  cost?: number;
}

export interface OrchestratorHooks {
  dispatchMessage?: (message: AgentMessage, context: RuntimeContext) => Promise<void>;
  waitForDelegationResult?: (taskId: string, context: RuntimeContext) => Promise<unknown>;
  supervise?: (goal: string, inputs: unknown, context: RuntimeContext) => Promise<SupervisionResult>;
}
