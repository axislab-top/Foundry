import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type {
  GovernanceCommandExecutedEvent,
  GovernanceInterventionReceivedEvent,
  GovernanceInterventionType,
} from '@contracts/events';

@Injectable()
export class GovernanceCommandBusService {
  constructor(private readonly messaging: MessagingService) {}

  async publishInterventionReceived(params: {
    companyId: string;
    interventionType: GovernanceInterventionType;
    source: GovernanceInterventionReceivedEvent['data']['source'];
    payload: Record<string, unknown>;
    sourceMessageId?: string;
    roomId?: string;
    traceId?: string;
    commandVersion?: number;
  }): Promise<void> {
    const evt: GovernanceInterventionReceivedEvent = {
      eventId: randomUUID(),
      eventType: 'governance.intervention.received',
      aggregateId: `${params.companyId}:${params.interventionType}`,
      aggregateType: 'governance',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        interventionId: randomUUID(),
        interventionType: params.interventionType,
        source: params.source,
        sourceMessageId: params.sourceMessageId,
        roomId: params.roomId,
        payload: params.payload,
        receivedAt: new Date().toISOString(),
        commandVersion: Math.max(1, Math.floor(params.commandVersion ?? 1)),
      },
      metadata: {
        traceId: params.traceId,
        audit: {
          trailType: 'intervention_received',
          recordedAt: new Date().toISOString(),
          source: params.source,
        },
      },
    };
    await this.messaging.publish(evt, { routingKey: evt.eventType, persistent: true });
  }

  async publishCommandExecuted(params: {
    companyId: string;
    commandType: string;
    status: GovernanceCommandExecutedEvent['data']['status'];
    payload?: Record<string, unknown>;
    reason?: string;
    rollbackOfCommandId?: string;
    traceId?: string;
    commandId?: string;
    commandVersion?: number;
  }): Promise<void> {
    const evt: GovernanceCommandExecutedEvent = {
      eventId: randomUUID(),
      eventType: 'governance.command.executed',
      aggregateId: params.commandId ?? randomUUID(),
      aggregateType: 'governance_command',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        commandId: params.commandId ?? randomUUID(),
        commandType: params.commandType,
        commandVersion: Math.max(1, Math.floor(params.commandVersion ?? 1)),
        status: params.status,
        rollbackOfCommandId: params.rollbackOfCommandId,
        reason: params.reason?.slice(0, 800),
        payload: params.payload,
        executedAt: new Date().toISOString(),
      },
      metadata: {
        traceId: params.traceId,
        audit: {
          trailType: 'command_executed',
          recordedAt: new Date().toISOString(),
          rollback: Boolean(params.rollbackOfCommandId),
        },
      },
    };
    await this.messaging.publish(evt, { routingKey: evt.eventType, persistent: true });
  }
}

