import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ExperienceRecapGeneratedEvent } from '@contracts/events';
import { MessagingService } from '@service/messaging';
import { SupervisorRegistry } from '@foundry/multi-agent-core';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

@Injectable()
export class ExperienceRecapGeneratedListener implements OnModuleInit {
  private readonly logger = new Logger(ExperienceRecapGeneratedListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly supervisorRegistry: SupervisorRegistry,
    private readonly monitoring: MonitoringService,
  ) {}

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<ExperienceRecapGeneratedEvent>(
      'experience.recap.generated',
      async (event) => {
        const startedAt = Date.now();
        try {
          const recap = (event.data as any)?.recap ?? {};
          const applied = this.supervisorRegistry.loadDynamicPolicies(recap);
          this.monitoring.recordExperienceDynamicPoliciesApplied(applied);
          this.monitoring.observeExperienceDynamicPolicyApplyLatencyMs('success', Date.now() - startedAt);
          this.logger.log('Loaded dynamic policies from recap', {
            recapId: event.data.recapId,
            discussionId: event.data.discussionId,
            applied,
          });
        } catch (e: unknown) {
          this.monitoring.observeExperienceDynamicPolicyApplyLatencyMs('error', Date.now() - startedAt);
          this.logger.warn('Load dynamic policies from recap failed', {
            message: e instanceof Error ? e.message : String(e),
            recapId: (event as any)?.data?.recapId,
          });
        }
      },
      {
        queue: 'worker-experience-recap-generated-queue',
        durable: true,
        prefetchCount: 10,
      },
    );
  }
}

