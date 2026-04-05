import type { BaseEvent } from './base-event.js';

export type OrganizationNodeType = 'board' | 'ceo' | 'department' | 'agent';

export interface OrganizationNodeCreatedEvent extends BaseEvent {
  eventType: 'organization.node.created';
  aggregateType: 'organization_node';
  data: {
    companyId: string;
    nodeId: string;
    parentId?: string;
    type: OrganizationNodeType;
    name: string;
    agentId?: string;
  };
}

export interface OrganizationNodeUpdatedEvent extends BaseEvent {
  eventType: 'organization.node.updated';
  aggregateType: 'organization_node';
  data: {
    companyId: string;
    nodeId: string;
    parentId?: string;
    type: OrganizationNodeType;
    name: string;
    agentId?: string;
  };
}

export interface OrganizationNodeMovedEvent extends BaseEvent {
  eventType: 'organization.node.moved';
  aggregateType: 'organization_node';
  data: {
    companyId: string;
    nodeId: string;
    newParentId?: string;
    newOrder: number;
  };
}

export interface OrganizationNodeDeletedEvent extends BaseEvent {
  eventType: 'organization.node.deleted';
  aggregateType: 'organization_node';
  data: {
    companyId: string;
    nodeId: string;
  };
}

export interface OrganizationStructureChangedEvent extends BaseEvent {
  eventType: 'organization.structure.changed';
  aggregateType: 'organization';
  data: {
    companyId: string;
    reason: string;
  };
}

export type OrganizationEvent =
  | OrganizationNodeCreatedEvent
  | OrganizationNodeUpdatedEvent
  | OrganizationNodeMovedEvent
  | OrganizationNodeDeletedEvent
  | OrganizationStructureChangedEvent;
