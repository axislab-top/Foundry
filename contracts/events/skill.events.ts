import type { BaseEvent } from './base-event.js';

/** Serialized skill row for workers / LangGraph without DB round-trips */
export interface SkillToolSnapshot {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  toolSchema: Record<string, unknown> | null;
  promptTemplate: string | null;
  implementationType: string;
  handlerConfig: Record<string, unknown> | null;
  requiredPermissions: string[];
  version: number;
  isPublic: boolean;
  isSystem: boolean;
}

export interface SkillExecutedEvent extends BaseEvent {
  eventType: 'skill.executed';
  aggregateType: 'skill';
  data: {
    companyId: string;
    agentId: string;
    skillId: string | null;
    skillName: string;
    traceId?: string;
    argsSummary: Record<string, unknown> | null;
    resultSummary: Record<string, unknown> | null;
    durationMs: number | null;
    billingUnits: number | null;
    executedAt: string;
  };
}

export type SkillEvent = SkillExecutedEvent;
