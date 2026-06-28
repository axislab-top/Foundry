import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MessageProcessingJob,
  type MessageProcessingJobDomain,
} from '../entities/message-processing-job.entity.js';

@Injectable()
export class MessageProcessingJobService {
  private readonly logger = new Logger(MessageProcessingJobService.name);

  constructor(
    @InjectRepository(MessageProcessingJob)
    private readonly repo: Repository<MessageProcessingJob>,
  ) {}

  async upsertPending(params: {
    companyId: string;
    messageId: string;
    roomId: string;
    domain?: MessageProcessingJobDomain;
    jobType: string;
    dedupeKey: string;
    aggregateType?: string | null;
    aggregateId?: string | null;
    parentJobId?: string | null;
    correlationId?: string | null;
    payload?: Record<string, unknown> | null;
  }): Promise<MessageProcessingJob> {
    const now = new Date();
    const existing = await this.repo.findOne({
      where: { companyId: params.companyId, dedupeKey: params.dedupeKey },
    });
    if (existing) {
      existing.messageId = params.messageId;
      existing.roomId = params.roomId;
      existing.domain = params.domain ?? existing.domain;
      existing.jobType = params.jobType;
      existing.status = 'pending';
      existing.payload = params.payload ?? existing.payload;
      existing.aggregateType = params.aggregateType ?? existing.aggregateType;
      existing.aggregateId = params.aggregateId ?? existing.aggregateId;
      existing.parentJobId = params.parentJobId ?? existing.parentJobId;
      existing.correlationId = params.correlationId ?? existing.correlationId;
      existing.nextRunAt = now;
      existing.updatedAt = now;
      return this.repo.save(existing);
    }
    const row = this.repo.create({
      companyId: params.companyId,
      messageId: params.messageId,
      roomId: params.roomId,
      domain: params.domain ?? 'message',
      jobType: params.jobType,
      dedupeKey: params.dedupeKey,
      status: 'pending',
      payload: params.payload ?? null,
      aggregateType: params.aggregateType ?? null,
      aggregateId: params.aggregateId ?? null,
      parentJobId: params.parentJobId ?? null,
      correlationId: params.correlationId ?? null,
      attemptCount: 0,
      lastError: null,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
    try {
      return await this.repo.save(row);
    } catch (error: unknown) {
      this.logger.warn('message_processing_jobs.insert_race', {
        companyId: params.companyId,
        dedupeKey: params.dedupeKey,
        err: error instanceof Error ? error.message : String(error),
      });
      const again = await this.repo.findOne({
        where: { companyId: params.companyId, dedupeKey: params.dedupeKey },
      });
      if (again) return again;
      throw error;
    }
  }

  async listPending(limit = 50): Promise<MessageProcessingJob[]> {
    return this.repo.find({
      where: { status: 'pending' },
      order: { nextRunAt: 'ASC' },
      take: Math.min(200, Math.max(1, limit)),
    });
  }

  async markSucceeded(job: MessageProcessingJob): Promise<MessageProcessingJob> {
    job.status = 'succeeded';
    job.updatedAt = new Date();
    return this.repo.save(job);
  }

  async markFailed(job: MessageProcessingJob, error: unknown): Promise<MessageProcessingJob> {
    job.status = 'failed';
    job.attemptCount += 1;
    job.lastError = error instanceof Error ? error.message : String(error);
    job.nextRunAt = new Date(Date.now() + 60_000);
    job.updatedAt = new Date();
    return this.repo.save(job);
  }
}
