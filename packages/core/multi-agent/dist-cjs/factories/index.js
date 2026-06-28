"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTaskDelegationMessage = void 0;
exports.createSampleTaskDelegation = createSampleTaskDelegation;
exports.createSampleAgentMessage = createSampleAgentMessage;
exports.createSampleApprovalRequest = createSampleApprovalRequest;
const agent_message_contract_js_1 = require("../contracts/agent-message.contract.js");
const approval_contract_js_1 = require("../contracts/approval.contract.js");
const task_delegation_contract_js_1 = require("../contracts/task-delegation.contract.js");
Object.defineProperty(exports, "createTaskDelegationMessage", { enumerable: true, get: function () { return task_delegation_contract_js_1.createTaskDelegationMessage; } });
function createSampleTaskDelegation(overrides = {}) {
    return task_delegation_contract_js_1.TaskDelegationSchema.parse({
        taskId: crypto.randomUUID(),
        ownerAgentId: 'ceo-agent',
        executorAgentId: 'specialist-agent',
        inputs: { objective: 'sample objective' },
        ...overrides,
    });
}
function createSampleAgentMessage(overrides = {}) {
    return (0, agent_message_contract_js_1.createAgentMessage)({
        traceId: 'trace-sample',
        fromAgentId: 'ceo-agent',
        toAgentId: 'dept-agent',
        intent: agent_message_contract_js_1.MessageIntent.TASK_DELEGATE,
        payload: { content: 'sample' },
        context: { companyId: 'company-1' },
        ...overrides,
    });
}
function createSampleApprovalRequest(overrides = {}) {
    return approval_contract_js_1.ApprovalRequestSchema.parse({
        traceId: 'trace-sample',
        riskLevel: approval_contract_js_1.RiskLevel.HIGH,
        requestedAction: 'task.execute:sample',
        policyRef: 'policy/default/high-risk',
        approver: 'human',
        expiresAt: Date.now() + 60_000,
        ...overrides,
    });
}
