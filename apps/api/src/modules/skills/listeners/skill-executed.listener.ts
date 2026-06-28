import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { SkillExecutedEvent } from '@contracts/events';
import { SkillExecutionLog } from '../entities/skill-execution-log.entity.js';

const TRACE_ID_MAX = 255;
const SKILL_NAME_MAX = 255;

@Injectable()
export class SkillExecutedListener implements OnModuleInit {
  private readonly logger = new Logger(SkillExecutedListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    @InjectRepository(SkillExecutionLog)
    private readonly logsRepo: Repository<SkillExecutionLog>,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<SkillExecutedEvent>(
      'skill.executed',
      this.handle.bind(this),
      {
        queue: 'api-skill-executed-queue',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: SkillExecutedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) {
      this.logger.warn('skill.executed missing companyId', { eventId: event.eventId });
      return;
    }
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const rawTrace = event.data.traceId?.trim();
      const traceId =
        rawTrace && rawTrace.length > TRACE_ID_MAX ? rawTrace.slice(0, TRACE_ID_MAX) : rawTrace || null;
      const skillName =
        event.data.skillName.length > SKILL_NAME_MAX
          ? event.data.skillName.slice(0, SKILL_NAME_MAX)
          : event.data.skillName;
      await this.logsRepo.save(
        this.logsRepo.create({
          companyId,
          agentId: event.data.agentId,
          skillId: event.data.skillId,
          skillName,
          traceId,
          argsSummary: event.data.argsSummary,
          resultSummary: event.data.resultSummary,
          durationMs: event.data.durationMs,
          billingUnits: event.data.billingUnits != null ? String(event.data.billingUnits) : null,
        }),
      );
    });
  }
}
