import { ZodError } from 'zod';
import { AgentMessageSchema, type AgentMessage } from '../contracts/agent-message.contract.js';
import { ApprovalRequestSchema, type ApprovalRequest } from '../contracts/approval.contract.js';
import { TaskDelegationSchema, type TaskDelegation } from '../contracts/task-delegation.contract.js';

export function parseAgentMessage(raw: unknown): AgentMessage {
  return AgentMessageSchema.parse(raw);
}

export function parseTaskDelegation(raw: unknown): TaskDelegation {
  return TaskDelegationSchema.parse(raw);
}

export function parseApprovalRequest(raw: unknown): ApprovalRequest {
  return ApprovalRequestSchema.parse(raw);
}

export function validateAgentMessage(raw: unknown) {
  return AgentMessageSchema.safeParse(raw);
}

export function validateTaskDelegation(raw: unknown) {
  return TaskDelegationSchema.safeParse(raw);
}

export function validateApprovalRequest(raw: unknown) {
  return ApprovalRequestSchema.safeParse(raw);
}

export function safeValidateAgentMessage(raw: unknown) {
  return AgentMessageSchema.safeParse(raw);
}

export function safeValidateTaskDelegation(raw: unknown) {
  return TaskDelegationSchema.safeParse(raw);
}

export function safeValidateApprovalRequest(raw: unknown) {
  return ApprovalRequestSchema.safeParse(raw);
}

export { ZodError };
