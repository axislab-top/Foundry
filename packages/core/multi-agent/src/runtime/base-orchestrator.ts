import type { AgentMessage } from '../contracts/agent-message.contract.js';
import { createTaskDelegationMessage, type TaskDelegation } from '../contracts/task-delegation.contract.js';
import type { SupervisionResult } from '../supervision/supervision-action.js';
import type {
  AgentRuntimeOptions,
  ExecutionResult,
  OrchestratorHooks,
  TaskDelegationRequest,
} from './types.js';
import { RuntimeContext } from './runtime-context.js';

/**
 * Base strategy orchestrator:
 * goal -> optional supervision -> task breakdown -> delegation dispatch.
 */
export abstract class BaseOrchestrator {
  protected context: RuntimeContext;

  protected readonly options: Required<AgentRuntimeOptions>;

  private readonly hooks: OrchestratorHooks;

  constructor(context: RuntimeContext, options: AgentRuntimeOptions = {}, hooks: OrchestratorHooks = {}) {
    this.context = context;
    this.options = {
      enableSupervision: options.enableSupervision ?? true,
      maxRetries: options.maxRetries ?? 3,
      defaultSlaSeconds: options.defaultSlaSeconds ?? 300,
    };
    this.hooks = hooks;
  }

  protected setContext(context: RuntimeContext): void {
    this.context = context;
  }

  public async orchestrate(goal: string, inputs?: unknown): Promise<ExecutionResult<unknown[]>> {
    return RuntimeContext.run(this.context, async () => {
      this.context.emitTrace({ type: 'orchestrator.start', goal });

      if (this.options.enableSupervision) {
        const supervision = await this.supervise(goal, inputs);
        this.context.emitTrace({ type: 'orchestrator.supervision', supervision });
        if (supervision.action === 'block') {
          return {
            success: false,
            error: new Error(`Blocked by supervisor: ${supervision.reason}`),
            traceEvents: this.context.getTraceEvents(),
          };
        }
      }

      const delegations = await this.breakdown(goal, inputs);
      const results = await Promise.all(
        delegations.map(async (request) => {
          const delegation = this.toTaskDelegation(request);
          const message = createTaskDelegationMessage(
            delegation,
            this.context.traceId,
            this.context.currentAgentId,
            request.executorAgentId,
            this.context.companyId,
          );
          await this.dispatchMessage(message);
          this.context.emitTrace({
            type: 'orchestrator.delegated',
            taskId: request.taskId,
            messageId: message.messageId,
            toAgentId: request.executorAgentId,
          });
          return this.waitForDelegationResult(request.taskId);
        }),
      );

      this.context.emitTrace({ type: 'orchestrator.completed', resultCount: results.length });
      return {
        success: true,
        data: results,
        traceEvents: this.context.getTraceEvents(),
      };
    });
  }

  protected abstract breakdown(goal: string, inputs?: unknown): Promise<TaskDelegationRequest[]>;

  protected async supervise(goal: string, inputs?: unknown): Promise<SupervisionResult> {
    if (this.hooks.supervise) {
      return this.hooks.supervise(goal, inputs, this.context);
    }
    return { action: 'allow', reason: 'default allow' };
  }

  protected async dispatchMessage(message: AgentMessage): Promise<void> {
    if (this.hooks.dispatchMessage) {
      await this.hooks.dispatchMessage(message, this.context);
      return;
    }
    this.context.emitTrace({
      type: 'orchestrator.dispatch.skipped',
      messageId: message.messageId,
    });
  }

  protected async waitForDelegationResult(taskId: string): Promise<unknown> {
    if (this.hooks.waitForDelegationResult) {
      return this.hooks.waitForDelegationResult(taskId, this.context);
    }
    return { taskId, status: 'completed' };
  }

  private toTaskDelegation(request: TaskDelegationRequest): TaskDelegation {
    return {
      taskId: request.taskId,
      parentTaskId: request.parentTaskId,
      ownerAgentId: this.context.currentAgentId,
      executorAgentId: request.executorAgentId,
      inputs: request.inputs,
      constraints: {
        maxRetries: this.options.maxRetries,
        slaSeconds: this.options.defaultSlaSeconds,
        ...request.constraints,
      },
      dependsOn: request.dependsOn ?? [],
      status: 'queued',
    };
  }
}
