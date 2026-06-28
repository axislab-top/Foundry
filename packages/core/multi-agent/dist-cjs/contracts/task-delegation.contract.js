"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskDelegationSchema = exports.TaskDelegationStatusSchema = void 0;
exports.createTaskDelegationMessage = createTaskDelegationMessage;
const zod_1 = require("zod");
const agent_message_contract_js_1 = require("./agent-message.contract.js");
exports.TaskDelegationStatusSchema = zod_1.z.enum([
    'queued',
    'running',
    'blocked',
    'completed',
    'failed',
    'cancelled',
]);
exports.TaskDelegationSchema = zod_1.z.object({
    taskId: zod_1.z.string().min(1),
    parentTaskId: zod_1.z.string().optional(),
    ownerAgentId: zod_1.z.string().min(1),
    executorAgentId: zod_1.z.string().min(1),
    inputs: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    constraints: zod_1.z
        .object({
        budgetCap: zod_1.z.number().nonnegative().optional(),
        slaSeconds: zod_1.z.number().int().positive().optional(),
        maxRetries: zod_1.z.number().int().nonnegative().default(3),
    })
        .optional(),
    dependsOn: zod_1.z.array(zod_1.z.string()).default([]),
    status: exports.TaskDelegationStatusSchema.default('queued'),
});
function createTaskDelegationMessage(delegation, traceId, fromAgentId, toAgentId, companyId) {
    return (0, agent_message_contract_js_1.createAgentMessage)({
        traceId,
        fromAgentId,
        toAgentId,
        intent: agent_message_contract_js_1.MessageIntent.TASK_DELEGATE,
        payload: { delegation },
        context: { companyId },
    });
}
