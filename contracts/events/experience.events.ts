import type { BaseEvent } from './base-event.js';

export interface ExperienceRecapGeneratedEvent extends BaseEvent {
  eventType: 'experience.recap.generated';
  aggregateType: 'experience_recap';
  data: {
    recapId: string;
    discussionId: string;
    companyId: string;
    outcome: 'success' | 'partial_success' | 'failure' | 'timeout';
    policySuggestions?: Array<{
      policyKey: string;
      suggestedValue: unknown;
      reason: string;
      confidence: number;
    }>;
    recap: Record<string, unknown>;
    generatedAt: string;
  };
}

export interface ExperienceEventTopics {
  'experience.recap.generated': ExperienceRecapGeneratedEvent;
}

