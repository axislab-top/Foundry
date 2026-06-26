import type { BaseEvent } from './base-event.js';

export type GovernanceInterventionType =
  | 'approval'
  | 'strategy_adjustment'
  | 'department_pause'
  | 'forced_arbitration'
  | 'risk_escalation'
  | 'inspect_finding'
  | 'evolution_suggestion';

export interface GovernanceInterventionReceivedEvent extends BaseEvent {
  eventType: 'governance.intervention.received';
  aggregateType: 'governance';
  data: {
    companyId: string;
    interventionId: string;
    interventionType: GovernanceInterventionType;
    source:
      | 'boss'
      | 'ceo'
      | 'department'
      | 'company_inspect'
      | 'organization_evolution_engine'
      | 'system';
    sourceMessageId?: string;
    roomId?: string;
    payload: Record<string, unknown>;
    receivedAt: string;
    commandVersion: number;
  };
}

export interface GovernanceCommandExecutedEvent extends BaseEvent {
  eventType: 'governance.command.executed';
  aggregateType: 'governance_command';
  data: {
    companyId: string;
    commandId: string;
    commandType: string;
    commandVersion: number;
    status: 'accepted' | 'applied' | 'rolled_back' | 'failed';
    rollbackOfCommandId?: string;
    reason?: string;
    payload?: Record<string, unknown>;
    executedAt: string;
  };
}

export interface GovernanceTimelineUpdatedEvent extends BaseEvent {
  eventType: 'governance.timeline.updated';
  aggregateType: 'governance_timeline';
  data: {
    companyId: string;
    timelineId: string;
    windowStart: string;
    windowEnd: string;
    entries: Array<{
      at: string;
      eventType: string;
      summary: string;
      severity: 'info' | 'warning' | 'critical';
    }>;
    updatedAt: string;
  };
}

export interface GovernanceInterventionRequestEvent extends BaseEvent {
  eventType: 'governance.intervention.request';
  aggregateType: 'governance_request';
  data: {
    companyId: string;
    requestId: string;
    requestedBy: string;
    interventionType: GovernanceInterventionType;
    payload: Record<string, unknown>;
    requestedAt: string;
    commandVersion: number;
  };
}

export interface OrganizationEvolutionSuggestionGeneratedEvent extends BaseEvent {
  eventType: 'organization.evolution.suggestion.generated';
  aggregateType: 'organization_evolution';
  data: {
    companyId: string;
    suggestionId: string;
    basedOnEventType: string;
    category: 'split_strategy' | 'prompt_template' | 'risk_threshold' | 'governance_policy';
    summary: string;
    recommendation: string;
    confidence: number;
    requiresBossApproval: boolean;
    generatedAt: string;
  };
}

export interface OrganizationEvolutionSuggestionApprovedEvent extends BaseEvent {
  eventType: 'organization.evolution.suggestion.approved';
  aggregateType: 'organization_evolution';
  data: {
    companyId: string;
    suggestionId: string;
    approvedBy: string;
    approvalNote?: string;
    approvedAt: string;
  };
}

export type GovernanceEvent =
  | GovernanceInterventionReceivedEvent
  | GovernanceCommandExecutedEvent
  | GovernanceTimelineUpdatedEvent
  | GovernanceInterventionRequestEvent
  | OrganizationEvolutionSuggestionGeneratedEvent
  | OrganizationEvolutionSuggestionApprovedEvent;

export interface GovernanceEventTopics {
  'governance.intervention.received': GovernanceInterventionReceivedEvent;
  'governance.command.executed': GovernanceCommandExecutedEvent;
  'governance.timeline.updated': GovernanceTimelineUpdatedEvent;
  'governance.intervention.request': GovernanceInterventionRequestEvent;
  'organization.evolution.suggestion.generated': OrganizationEvolutionSuggestionGeneratedEvent;
  'organization.evolution.suggestion.approved': OrganizationEvolutionSuggestionApprovedEvent;
}

