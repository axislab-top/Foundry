import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  GovernanceCommandExecutedEvent,
  GovernanceInterventionReceivedEvent,
  GovernanceInterventionRequestEvent,
  GovernanceTimelineUpdatedEvent,
  OrganizationEvolutionSuggestionGeneratedEvent,
} from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { randomUUID } from 'crypto';
import { GovernanceCommandBusService } from './governance-command-bus.service.js';

@Injectable()
export class BossGovernanceAggregatorListener implements OnModuleInit {
  private readonly logger = new Logger(BossGovernanceAggregatorListener.name);
  private readonly timelineByCompany = new Map<
    string,
    Array<{ at: string; eventType: string; summary: string; severity: 'info' | 'warning' | 'critical' }>
  >();

  constructor(
    private readonly messaging: MessagingService,
    private readonly governanceBus: GovernanceCommandBusService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<GovernanceInterventionReceivedEvent>(
      'governance.intervention.received',
      this.handleGovernanceSignal.bind(this),
      { queue: 'worker-boss-governance-intervention', durable: true, prefetchCount: 10 },
    );
    this.messaging.subscribeWithBackoff<GovernanceCommandExecutedEvent>(
      'governance.command.executed',
      this.handleGovernanceSignal.bind(this),
      { queue: 'worker-boss-governance-command', durable: true, prefetchCount: 10 },
    );
    this.messaging.subscribeWithBackoff<OrganizationEvolutionSuggestionGeneratedEvent>(
      'organization.evolution.suggestion.generated',
      this.handleEvolutionSignal.bind(this),
      { queue: 'worker-boss-governance-evolution', durable: true, prefetchCount: 10 },
    );
    this.messaging.subscribeWithBackoff<GovernanceInterventionRequestEvent>(
      'governance.intervention.request',
      this.handleInterventionRequest.bind(this),
      { queue: 'worker-boss-governance-intervention-request', durable: true, prefetchCount: 10 },
    );
  }

  private severityFromEvent(eventType: string): 'info' | 'warning' | 'critical' {
    if (eventType.includes('forced') || eventType.includes('failed')) return 'critical';
    if (eventType.includes('intervention') || eventType.includes('risk')) return 'warning';
    return 'info';
  }

  private async publishTimeline(companyId: string): Promise<void> {
    const entries = [...(this.timelineByCompany.get(companyId) ?? [])].slice(-80);
    const windowStart = entries[0]?.at ?? new Date().toISOString();
    const windowEnd = entries[entries.length - 1]?.at ?? new Date().toISOString();
    const evt: GovernanceTimelineUpdatedEvent = {
      eventId: randomUUID(),
      eventType: 'governance.timeline.updated',
      aggregateId: `${companyId}:timeline`,
      aggregateType: 'governance_timeline',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        timelineId: `${companyId}:timeline`,
        windowStart,
        windowEnd,
        entries,
        updatedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(evt, { routingKey: evt.eventType, persistent: true });
  }

  private async appendTimeline(companyId: string, eventType: string, summary: string): Promise<void> {
    const list = this.timelineByCompany.get(companyId) ?? [];
    list.push({
      at: new Date().toISOString(),
      eventType,
      summary: summary.slice(0, 500),
      severity: this.severityFromEvent(eventType),
    });
    this.timelineByCompany.set(companyId, list.slice(-200));
    await this.publishTimeline(companyId);
  }

  private async handleGovernanceSignal(
    evt: GovernanceInterventionReceivedEvent | GovernanceCommandExecutedEvent,
  ): Promise<void> {
    const companyId = String(evt.data.companyId ?? evt.companyId ?? '').trim();
    if (!companyId) return;
    const summary =
      evt.eventType === 'governance.intervention.received'
        ? `intervention=${evt.data.interventionType} source=${evt.data.source}`
        : `command=${evt.data.commandType} status=${evt.data.status}`;
    await this.appendTimeline(companyId, evt.eventType, summary);
  }

  private async handleEvolutionSignal(evt: OrganizationEvolutionSuggestionGeneratedEvent): Promise<void> {
    const companyId = String(evt.data.companyId ?? evt.companyId ?? '').trim();
    if (!companyId) return;
    await this.appendTimeline(
      companyId,
      evt.eventType,
      `evolution_suggestion category=${evt.data.category} confidence=${evt.data.confidence}`,
    );
  }

  private async handleInterventionRequest(evt: GovernanceInterventionRequestEvent): Promise<void> {
    const companyId = String(evt.data.companyId ?? evt.companyId ?? '').trim();
    if (!companyId) return;
    await this.governanceBus.publishInterventionReceived({
      companyId,
      interventionType: evt.data.interventionType,
      source: 'boss',
      commandVersion: evt.data.commandVersion,
      payload: evt.data.payload,
      traceId: evt.eventId,
    });
    await this.governanceBus.publishCommandExecuted({
      companyId,
      commandType: `boss_intervention.${evt.data.interventionType}`,
      status: 'accepted',
      commandVersion: evt.data.commandVersion,
      commandId: evt.data.requestId,
      payload: evt.data.payload,
      reason: 'boss requested intervention',
      traceId: evt.eventId,
    });
    await this.appendTimeline(
      companyId,
      evt.eventType,
      `boss_intervention_request type=${evt.data.interventionType}`,
    );
    this.logger.log('boss intervention request routed', {
      companyId,
      requestId: evt.data.requestId,
      interventionType: evt.data.interventionType,
    });
  }
}

