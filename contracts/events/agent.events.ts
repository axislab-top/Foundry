import type { BaseEvent } from './base-event.js';
import type { SkillToolSnapshot } from './skill.events.js';

export type AgentStatus = 'active' | 'inactive' | 'suspended';

export interface AgentCreatedEvent extends BaseEvent {
  eventType: 'agent.created';
  aggregateType: 'agent';
  data: {
    companyId: string;
    agentId: string;
    organizationNodeId?: string;
    name: string;
    role: string;
    llmModel?: string;
    status: AgentStatus;
    createdAt: string;
  };
}

export interface AgentUpdatedEvent extends BaseEvent {
  eventType: 'agent.updated';
  aggregateType: 'agent';
  data: {
    companyId: string;
    agentId: string;
    changes: Record<string, unknown>;
    updatedAt: string;
  };
}

export interface AgentDeletedEvent extends BaseEvent {
  eventType: 'agent.deleted';
  aggregateType: 'agent';
  data: {
    companyId: string;
    agentId: string;
    deletedAt: string;
  };
}

export interface AgentStatusChangedEvent extends BaseEvent {
  eventType: 'agent.status_changed';
  aggregateType: 'agent';
  data: {
    companyId: string;
    agentId: string;
    fromStatus: AgentStatus;
    toStatus: AgentStatus;
    changedAt: string;
  };
}

export interface AgentSkillsChangedEvent extends BaseEvent {
  eventType: 'agent.skills.changed';
  aggregateType: 'agent';
  data: {
    companyId: string;
    agentId: string;
    skillIds: string[];
    /** Full skill definitions for Worker ToolRegistry (no DB read). */
    skills?: SkillToolSnapshot[];
    changedAt: string;
  };
}

export interface AgentApprovedEvent extends BaseEvent {
  eventType: 'agent.approved';
  aggregateType: 'agent';
  data: {
    companyId: string;
    agentId: string;
    approvedBy?: string;
    appliedFields: string[];
    approvedAt: string;
  };
}

/** Human-in-the-loop：敏感字段进入 pendingConfig，待 Owner/Admin 审批 */
export interface AgentNeedApprovalEvent extends BaseEvent {
  eventType: 'agent.need_approval';
  aggregateType: 'agent';
  data: {
    companyId: string;
    agentId: string;
    requestedBy?: string;
    pendingFields: string[];
    requestedAt: string;
  };
}

export type AgentEvent =
  | AgentCreatedEvent
  | AgentUpdatedEvent
  | AgentDeletedEvent
  | AgentStatusChangedEvent
  | AgentSkillsChangedEvent
  | AgentApprovedEvent
  | AgentNeedApprovalEvent;
