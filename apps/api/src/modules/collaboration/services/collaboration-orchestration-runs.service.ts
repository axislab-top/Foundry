import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DEFAULT_ORCHESTRATION_RUN_STALE_MS, isOrchestrationRunStale } from '@contracts/types';
import { CollaborationOrchestrationRun } from '../entities/collaboration-orchestration-run.entity.js';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';

export type OrchestrationRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
export type OrchestrationRunLifecycleStatus =
  | 'awaiting_confirm'
  | 'planning'
  | 'dispatching'
  | 'dept_executing'
  | 'supervising'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'paused';

export function serializeCollaborationOrchestrationRun(row: CollaborationOrchestrationRun) {
  return {
    id: row.id,
    companyId: row.companyId,
    roomId: row.roomId,
    sourceMessageId: row.sourceMessageId,
    programId: row.programId,
    workerRunId: row.workerRunId,
    status: row.status,
    stage: row.stage,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    metadata: row.metadata,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

@Injectable()
export class CollaborationOrchestrationRunsService {
  private readonly logger = new Logger(CollaborationOrchestrationRunsService.name);

  constructor(
    @InjectRepository(CollaborationOrchestrationRun)
    private readonly repo: Repository<CollaborationOrchestrationRun>,
    private readonly collabRealtime: CollaborationRealtimePublisher,
  ) {}

  async workerUpsert(params: {
    companyId: string;
    roomId: string;
    sourceMessageId: string;
    workerRunId?: string | null;
    programId?: string | null;
    /** 兼容 legacy succeeded/running；同时允许 lifecycle 字符串写入。 */
    status: OrchestrationRunStatus | OrchestrationRunLifecycleStatus;
    stage?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<CollaborationOrchestrationRun> {
    const now = new Date();
    const existing = await this.repo.findOne({
      where: { companyId: params.companyId, sourceMessageId: params.sourceMessageId },
    });
    if (existing) {
      existing.roomId = params.roomId;
      existing.workerRunId = params.workerRunId ?? existing.workerRunId;
      if (params.programId !== undefined) existing.programId = params.programId;
      existing.status = params.status;
      if (params.stage !== undefined) existing.stage = params.stage;
      if (params.errorCode !== undefined) existing.errorCode = params.errorCode;
      if (params.errorMessage !== undefined) existing.errorMessage = params.errorMessage;
      if (params.metadata !== undefined) {
        existing.metadata =
          params.metadata === null
            ? null
            : { ...(existing.metadata ?? {}), ...params.metadata };
      }
      existing.updatedAt = now;
      const saved = await this.repo.save(existing);
      void this.publishOrchestrationUpdated(saved);
      return saved;
    }
    const row = this.repo.create({
      companyId: params.companyId,
      roomId: params.roomId,
      sourceMessageId: params.sourceMessageId,
      workerRunId: params.workerRunId ?? null,
      programId: params.programId ?? null,
      status: params.status,
      stage: params.stage ?? null,
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage ?? null,
      metadata: params.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    });
    try {
      const saved = await this.repo.save(row);
      void this.publishOrchestrationUpdated(saved);
      return saved;
    } catch (e: unknown) {
      this.logger.warn('collaboration_orchestration_runs.insert_race', {
        companyId: params.companyId,
        sourceMessageId: params.sourceMessageId,
        err: e instanceof Error ? e.message : String(e),
      });
      const again = await this.repo.findOne({
        where: { companyId: params.companyId, sourceMessageId: params.sourceMessageId },
      });
      if (again) {
        again.roomId = params.roomId;
        again.workerRunId = params.workerRunId ?? again.workerRunId;
        if (params.programId !== undefined) again.programId = params.programId;
        again.status = params.status;
        if (params.stage !== undefined) again.stage = params.stage;
        if (params.errorCode !== undefined) again.errorCode = params.errorCode;
        if (params.errorMessage !== undefined) again.errorMessage = params.errorMessage;
        if (params.metadata !== undefined) {
          again.metadata =
            params.metadata === null ? null : { ...(again.metadata ?? {}), ...params.metadata };
        }
        again.updatedAt = now;
        const savedAgain = await this.repo.save(again);
        void this.publishOrchestrationUpdated(savedAgain);
        return savedAgain;
      }
      throw e;
    }
  }

  private async publishOrchestrationUpdated(row: CollaborationOrchestrationRun): Promise<void> {
    try {
      await this.collabRealtime.publishEnvelope({
        event: 'orchestration:updated',
        companyId: row.companyId,
        roomId: row.roomId,
        payload: serializeCollaborationOrchestrationRun(row),
      });
    } catch (e: unknown) {
      this.logger.warn('collaboration_orchestration_runs.realtime_publish_failed', {
        companyId: row.companyId,
        roomId: row.roomId,
        sourceMessageId: row.sourceMessageId,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async listByRoom(companyId: string, roomId: string, limit = 30): Promise<CollaborationOrchestrationRun[]> {
    await this.reconcileStaleRunningRuns(companyId, roomId);
    return this.repo.find({
      where: { companyId, roomId },
      order: { updatedAt: 'DESC' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  /**
   * 将长时间无心跳的 `running` 行标为 failed，避免 UI / E2E 永久卡在 before_runMainRoomFlow。
   * Worker 进程崩溃或 LLM 挂起时不会写 terminal 状态，由读路径兜底。
   */
  private async reconcileStaleRunningRuns(companyId: string, roomId: string): Promise<number> {
    const staleMs = this.readStaleThresholdMs();
    const rows = await this.repo.find({
      where: { companyId, roomId, status: 'running' },
      take: 50,
    });
    let reconciled = 0;
    for (const row of rows) {
      if (!isOrchestrationRunStale(row.updatedAt, staleMs)) continue;
      row.status = 'failed';
      row.stage = 'stale_timeout';
      row.errorCode = 'ORCHESTRATION_STALE';
      row.errorMessage = `编排 run 超过 ${Math.round(staleMs / 60_000)} 分钟无进展，已自动标记失败`;
      row.updatedAt = new Date();
      const saved = await this.repo.save(row);
      void this.publishOrchestrationUpdated(saved);
      reconciled += 1;
      this.logger.warn('collaboration_orchestration_runs.stale_reconciled', {
        companyId,
        roomId,
        sourceMessageId: row.sourceMessageId,
        workerRunId: row.workerRunId,
        staleMs,
      });
    }
    return reconciled;
  }

  private readStaleThresholdMs(): number {
    const raw = Number(process.env.ORCHESTRATION_RUN_STALE_MS ?? DEFAULT_ORCHESTRATION_RUN_STALE_MS);
    return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_ORCHESTRATION_RUN_STALE_MS;
  }
}
