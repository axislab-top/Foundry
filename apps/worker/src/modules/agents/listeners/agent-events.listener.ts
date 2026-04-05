import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { BaseEvent } from '@contracts/events';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { SkillAwareAiRuntimeAdapter } from '../adapters/ai-runtime.adapter.js';

const AGENT_EVENT_TYPES = [
  'agent.created',
  'agent.updated',
  'agent.deleted',
  'agent.status_changed',
  'agent.skills.changed',
  'agent.approved',
  'agent.need_approval',
] as const;

@Injectable()
export class AgentEventsListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
    private readonly aiRuntime: SkillAwareAiRuntimeAdapter,
  ) {}

  onModuleInit() {
    for (const eventType of AGENT_EVENT_TYPES) {
      this.messagingService.subscribeWithBackoff<BaseEvent>(
        eventType,
        (event) => this.handle(eventType, event),
        {
          queue: `worker-${eventType.replace(/\./g, '-')}-queue`,
          durable: true,
          prefetchCount: 10,
          retry: {
            enabled: true,
            maxAttempts: 5,
            initialDelayMs: 1000,
            backoffFactor: 2,
            maxDelayMs: 60_000,
          },
        },
      );
    }
  }

  private async handle(eventType: string, event: BaseEvent & { data?: Record<string, unknown> }): Promise<void> {
    const ok = this.idempotency.markIfNew(`${eventType}:${event.eventId}`, 24 * 60 * 60_000);
    if (!ok) {
      this.logger.warn('Duplicate agent event skipped', { eventType, eventId: event.eventId });
      return;
    }

    const companyId =
      resolveCompanyIdFromEvent(event) ||
      (event.data && (event.data as any).companyId) ||
      undefined;

    const run = async () => {
      this.logger.info('Agent event consumed', {
        eventType,
        eventId: event.eventId,
        companyId,
      });
      await this.aiRuntime.onAgentEvent(eventType, {
        ...event,
        data: event.data,
      } as Record<string, unknown>);
    };

    if (companyId) {
      await this.tenantContext.runWithCompanyId(companyId, run);
    } else {
      await run();
    }
  }
}
