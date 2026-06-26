import {
  createAgentMessage,
  MessageIntent,
  type AgentMessage,
} from '../contracts/agent-message.contract.js';
import { ApprovalRequestSchema, RiskLevel, type ApprovalRequest } from '../contracts/approval.contract.js';
import {
  TaskDelegationSchema,
  createTaskDelegationMessage,
  type TaskDelegation,
} from '../contracts/task-delegation.contract.js';

export function createSampleTaskDelegation(overrides: Partial<TaskDelegation> = {}): TaskDelegation {
  return TaskDelegationSchema.parse({
    taskId: crypto.randomUUID(),
    ownerAgentId: 'ceo-agent',
    executorAgentId: 'specialist-agent',
    inputs: { objective: 'sample objective' },
    ...overrides,
  });
}

export function createSampleAgentMessage(overrides: Partial<AgentMessage> = {}) {
  return createAgentMessage({
    traceId: 'trace-sample',
    fromAgentId: 'ceo-agent',
    toAgentId: 'dept-agent',
    intent: MessageIntent.TASK_DELEGATE,
    payload: { content: 'sample' },
    context: { companyId: 'company-1' },
    ...overrides,
  });
}

export function createSampleApprovalRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return ApprovalRequestSchema.parse({
    traceId: 'trace-sample',
    riskLevel: RiskLevel.HIGH,
    requestedAction: 'task.execute:sample',
    policyRef: 'policy/default/high-risk',
    approver: 'human',
    expiresAt: Date.now() + 60_000,
    ...overrides,
  });
}

export { createTaskDelegationMessage };
