import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { AutonomousCeoHeartbeatCompletedEvent } from '@contracts/events/autonomous.events.js';
import { Company } from '../../companies/entities/company.entity.js';
import { DailyBriefSummaryService } from '../services/daily-brief-summary.service.js';
import {
  getLocalDateStringFromInstant,
  normalizeCompanyTimezone,
} from '../utils/daily-brief-time.util.js';

@Injectable()
export class HeartbeatDailyBriefListener implements OnModuleInit {
  private readonly logger = new Logger(HeartbeatDailyBriefListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly summaryService: DailyBriefSummaryService,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<AutonomousCeoHeartbeatCompletedEvent>(
      'autonomous.ceo.heartbeat.completed',
      this.handle.bind(this),
      {
        queue: 'api-daily-brief-heartbeat',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: AutonomousCeoHeartbeatCompletedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data?.companyId;
    if (!companyId) return;

    const preview = event.data?.reportPreview?.trim();
    if (!preview) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        const company = await this.companiesRepo.findOne({
          where: { id: companyId },
          select: ['timezone'],
        });
        const timezone = normalizeCompanyTimezone(company?.timezone);
        const tickAt = event.data.tickAt || event.occurredAt;
        const briefDate = getLocalDateStringFromInstant(tickAt, timezone);

        await this.summaryService.upsertHeartbeatSnapshot({
          companyId,
          briefDate,
          summaryText: preview,
          heartbeatRunId: event.data.runId ?? null,
          metadata: {
            runKind: event.data.runKind,
            threadId: event.data.threadId,
            tickAt,
          },
        });
      } catch (e: unknown) {
        this.logger.warn('daily brief heartbeat snapshot failed', {
          companyId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
