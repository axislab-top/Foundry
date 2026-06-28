"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseOrchestrator = void 0;
const task_delegation_contract_js_1 = require("../contracts/task-delegation.contract.js");
const runtime_context_js_1 = require("./runtime-context.js");
/**
 * Base strategy orchestrator:
 * goal -> optional supervision -> task breakdown -> delegation dispatch.
 */
class BaseOrchestrator {
    context;
    options;
    hooks;
    constructor(context, options = {}, hooks = {}) {
        this.context = context;
        this.options = {
            enableSupervision: options.enableSupervision ?? true,
            maxRetries: options.maxRetries ?? 3,
            defaultSlaSeconds: options.defaultSlaSeconds ?? 300,
        };
        this.hooks = hooks;
    }
    setContext(context) {
        this.context = context;
    }
    async orchestrate(goal, inputs) {
        return runtime_context_js_1.RuntimeContext.run(this.context, async () => {
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
            const results = await Promise.all(delegations.map(async (request) => {
                const delegation = this.toTaskDelegation(request);
                const message = (0, task_delegation_contract_js_1.createTaskDelegationMessage)(delegation, this.context.traceId, this.context.currentAgentId, request.executorAgentId, this.context.companyId);
                await this.dispatchMessage(message);
                this.context.emitTrace({
                    type: 'orchestrator.delegated',
                    taskId: request.taskId,
                    messageId: message.messageId,
                    toAgentId: request.executorAgentId,
                });
                return this.waitForDelegationResult(request.taskId);
            }));
            this.context.emitTrace({ type: 'orchestrator.completed', resultCount: results.length });
            return {
                success: true,
                data: results,
                traceEvents: this.context.getTraceEvents(),
            };
        });
    }
    async supervise(goal, inputs) {
        if (this.hooks.supervise) {
            return this.hooks.supervise(goal, inputs, this.context);
        }
        return { action: 'allow', reason: 'default allow' };
    }
    async dispatchMessage(message) {
        if (this.hooks.dispatchMessage) {
            await this.hooks.dispatchMessage(message, this.context);
            return;
        }
        this.context.emitTrace({
            type: 'orchestrator.dispatch.skipped',
            messageId: message.messageId,
        });
    }
    async waitForDelegationResult(taskId) {
        if (this.hooks.waitForDelegationResult) {
            return this.hooks.waitForDelegationResult(taskId, this.context);
        }
        return { taskId, status: 'completed' };
    }
    toTaskDelegation(request) {
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
exports.BaseOrchestrator = BaseOrchestrator;
