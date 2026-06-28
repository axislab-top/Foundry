import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import { QueryFailedError, Repository } from 'typeorm';
import { EventIdempotencyKey } from '../entities/event-idempotency-key.entity.js';
import { MemoryService } from '../services/memory.service.js';
import { companyNamespace } from '../utils/memory-namespace.js';

import type { BaseEvent } from '@contracts/events';

interface DirectorReviewedEvent extends BaseEvent {
  eventType: 'task.reviewed.by_director';
  aggregateType: 'task';
  data: {
    companyId?: string;
    taskId?: string;
    reviewerAgentId?: string;
    traceId?: string;
    qualityScore?: number;
    overallAssessment?: string;
    approveToProceed?: boolean;
    performanceImpact?: string;
  };
}

interface DirectorProgressReportedEvent extends BaseEvent {
  eventType: 'director.progress.reported';
  aggregateType: 'agent';
  data: {
    companyId?: string;
    directorAgentId?: string;
    roomId?: string;
    reportType?: string;
    messageId?: string;
    traceId?: string;
  };
}

@Injectable()
export class DirectorManagementMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(DirectorManagementMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
    @InjectRepository(EventIdempotencyKey)
    private readonly eventIdempotencyRepo: Repository<EventIdempotencyKey>,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<DirectorReviewedEvent>(
      'task.reviewed.by_director',
      (event) => this.onDirectorReview(event),
      { queue: 'api-director-review-memory', durable: true, prefetchCount: 20 },
    );
    this.messaging.subscribeWithBackoff<DirectorProgressReportedEvent>(
      'director.progress.reported',
      (event) => this.onDirectorProgress(event),
      { queue: 'api-director-progress-memory', durable: true, prefetchCount: 20 },
    );
  }

  private async onDirectorReview(event: DirectorReviewedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event as unknown as Record<string, unknown>) ?? event.data?.companyId;
    const taskId = event.data?.taskId;
    if (!companyId || !taskId) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const content = `主管审查 taskId=${taskId} quality=${event.data?.qualityScore ?? 'n/a'} assessment=${event.data?.overallAssessment ?? 'unknown'} approve=${String(event.data?.approveToProceed ?? false)} impact=${event.data?.performanceImpact ?? 'neutral'}`;
      try {
        await this.memory.storeEntry({
          companyId,
          namespace: companyNamespace(),
          collectionLabel: 'Director reviews',
          content,
          sourceType: 'task',
          sourceRef: taskId,
          metadata: {
            tag: 'performance',
            tags: ['performance', 'review', 'director_management'],
            category: 'director_review',
            subCategory: 'task_review',
            version: 1,
            eventId: event.eventId,
            traceId: event.data?.traceId ?? null,
            reviewerAgentId: event.data?.reviewerAgentId,
            relatedAgentIds: [event.data?.reviewerAgentId].filter((x): x is string => !!x),
            relatedTaskIds: [taskId],
          },
          skipAccessCheck: true,
        });
      } catch (e: any) {
        this.logger.warn('director review memory store failed', { message: e?.message });
      }
    });
  }

  private async onDirectorProgress(event: DirectorProgressReportedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event as unknown as Record<string, unknown>) ?? event.data?.companyId;
    if (!companyId || !event.data?.directorAgentId) return;
    const shouldProcess = await this.reserveDirectorProgressIdempotency(companyId, event);
    if (!shouldProcess) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const content = `主管汇报 directorAgentId=${event.data?.directorAgentId} reportType=${event.data?.reportType ?? 'ad-hoc'} roomId=${event.data?.roomId ?? 'n/a'} messageId=${event.data?.messageId ?? 'n/a'}`;
      try {
        await this.memory.storeEntry({
          companyId,
          namespace: companyNamespace(),
          collectionLabel: 'Director progress reports',
          content,
          sourceType: 'task',
          sourceRef: event.data?.messageId ?? event.data?.directorAgentId,
          metadata: {
            tag: 'reporting',
            tags: ['reporting', 'report', 'delegation', 'director_management'],
            category: 'director_progress_report',
            subCategory: 'collaboration_room_post',
            version: 1,
            reportType: event.data?.reportType ?? 'ad-hoc',
            roomId: event.data?.roomId ?? null,
            eventId: event.eventId,
            traceId: event.data?.traceId ?? null,
            relatedAgentIds: [event.data?.directorAgentId].filter((x): x is string => !!x),
          },
          skipAccessCheck: true,
        });
      } catch (e: any) {
        this.logger.warn('director progress memory store failed', { message: e?.message });
      }
    });
  }

  private getDirectorProgressIdempotencyKey(event: DirectorProgressReportedEvent): string | null {
    if (event.data?.messageId) return `director.progress.reported:${event.data.messageId}`;
    if (event.eventId) return `director.progress.reported:event:${event.eventId}`;
    if (event.data?.directorAgentId && event.occurredAt) {
      return `director.progress.reported:fallback:${event.data.directorAgentId}:${event.occurredAt}`;
    }
    return null;
  }

  private async reserveDirectorProgressIdempotency(
    companyId: string,
    event: DirectorProgressReportedEvent,
  ): Promise<boolean> {
    const key = this.getDirectorProgressIdempotencyKey(event);
    if (!key) return true;
    try {
      await this.eventIdempotencyRepo.insert({
        companyId,
        eventType: 'director.progress.reported',
        idempotencyKey: key,
      });
      return true;
    } catch (e: any) {
      const pgCode =
        e instanceof QueryFailedError ? e.driverError?.code : e?.driverError?.code ?? e?.code;
      if (pgCode === '23505') {
        this.logger.debug(`skip duplicate director.progress.reported: ${key}`);
        return false;
      }
      throw e;
    }
  }
}

