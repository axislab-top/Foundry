"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodError = void 0;
exports.parseAgentMessage = parseAgentMessage;
exports.parseTaskDelegation = parseTaskDelegation;
exports.parseApprovalRequest = parseApprovalRequest;
exports.validateAgentMessage = validateAgentMessage;
exports.validateTaskDelegation = validateTaskDelegation;
exports.validateApprovalRequest = validateApprovalRequest;
exports.safeValidateAgentMessage = safeValidateAgentMessage;
exports.safeValidateTaskDelegation = safeValidateTaskDelegation;
exports.safeValidateApprovalRequest = safeValidateApprovalRequest;
const zod_1 = require("zod");
Object.defineProperty(exports, "ZodError", { enumerable: true, get: function () { return zod_1.ZodError; } });
const agent_message_contract_js_1 = require("../contracts/agent-message.contract.js");
const approval_contract_js_1 = require("../contracts/approval.contract.js");
const task_delegation_contract_js_1 = require("../contracts/task-delegation.contract.js");
function parseAgentMessage(raw) {
    return agent_message_contract_js_1.AgentMessageSchema.parse(raw);
}
function parseTaskDelegation(raw) {
    return task_delegation_contract_js_1.TaskDelegationSchema.parse(raw);
}
function parseApprovalRequest(raw) {
    return approval_contract_js_1.ApprovalRequestSchema.parse(raw);
}
function validateAgentMessage(raw) {
    return agent_message_contract_js_1.AgentMessageSchema.safeParse(raw);
}
function validateTaskDelegation(raw) {
    return task_delegation_contract_js_1.TaskDelegationSchema.safeParse(raw);
}
function validateApprovalRequest(raw) {
    return approval_contract_js_1.ApprovalRequestSchema.safeParse(raw);
}
function safeValidateAgentMessage(raw) {
    return agent_message_contract_js_1.AgentMessageSchema.safeParse(raw);
}
function safeValidateTaskDelegation(raw) {
    return task_delegation_contract_js_1.TaskDelegationSchema.safeParse(raw);
}
function safeValidateApprovalRequest(raw) {
    return approval_contract_js_1.ApprovalRequestSchema.safeParse(raw);
}
