"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentMessageSchema = exports.AgentMessageStatusSchema = exports.MessageIntent = void 0;
exports.createAgentMessage = createAgentMessage;
const zod_1 = require("zod");
var MessageIntent;
(function (MessageIntent) {
    MessageIntent["TASK_DELEGATE"] = "task.delegate";
    MessageIntent["TASK_UPDATE"] = "task.update";
    MessageIntent["APPROVAL_REQUEST"] = "approval.request";
    MessageIntent["APPROVAL_RESPONSE"] = "approval.response";
    MessageIntent["HEARTBEAT"] = "system.heartbeat";
    MessageIntent["MEMORY_UPDATE"] = "memory.update";
    MessageIntent["HUMAN_IN_LOOP"] = "human.request";
})(MessageIntent || (exports.MessageIntent = MessageIntent = {}));
exports.AgentMessageStatusSchema = zod_1.z.enum([
    'created',
    'dispatched',
    'acked',
    'completed',
    'failed',
    'timeout',
]);
exports.AgentMessageSchema = zod_1.z.object({
    messageId: zod_1.z.string().default(() => crypto.randomUUID()),
    traceId: zod_1.z.string().min(1),
    fromAgentId: zod_1.z.string().min(1),
    toAgentId: zod_1.z.union([zod_1.z.string().min(1), zod_1.z.literal('broadcast')]),
    intent: zod_1.z.nativeEnum(MessageIntent),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    context: zod_1.z.object({
        companyId: zod_1.z.string(),
        tenantId: zod_1.z.string().optional(),
        sessionId: zod_1.z.string().optional(),
    }),
    priority: zod_1.z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    ttl: zod_1.z.number().int().positive().default(3600),
    timestamp: zod_1.z.number().int().default(() => Date.now()),
    idempotencyKey: zod_1.z.string().optional(),
    status: exports.AgentMessageStatusSchema.default('created'),
});
function createAgentMessage(partial) {
    const msg = exports.AgentMessageSchema.parse(partial);
    return {
        ...msg,
        idempotencyKey: partial.idempotencyKey ?? `${msg.traceId}-${msg.messageId}`,
    };
}
