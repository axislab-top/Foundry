import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CollaborationProgramPhase, ProgramTimelineEvent, ProgramTimelineEventKind } from '@contracts/types';
import { collaborationProgramTimelineKey } from '@contracts/types/collab-redis-keys';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { serializeUnknownErrorForLog } from '../../../common/logging/serialize-unknown-error.js';

const PROGRAM_TIMELINE_MAX_EVENTS = 300;

@Injectable()
export class CollaborationProgramTimelineService {
  private readonly logger = new Logger(CollaborationProgramTimelineService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly collabRedis: CollabRedisCacheService,
  ) {}

  isEnabled(): boolean {
    return this.config.isCollabProgramTimelineEnabled();
  }

  async append(params: {
    companyId: string;
    programId: string;
    phase: CollaborationProgramPhase;
    kind: ProgramTimelineEventKind;
    summary: string;
    traceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<ProgramTimelineEvent | null> {
    if (!this.isEnabled()) return null;
    const companyId = String(params.companyId ?? '').trim();
    const programId = String(params.programId ?? '').trim();
    if (!companyId || !programId) return null;

    const summary = String(params.summary ?? '').trim();
    if (!summary) return null;

    const event: ProgramTimelineEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      phase: params.phase,
      kind: params.kind,
      summary: summary.slice(0, 400),
      ...(params.traceId ? { traceId: String(params.traceId).trim().slice(0, 128) } : {}),
      ...(params.metadata && Object.keys(params.metadata).length ? { metadata: params.metadata } : {}),
    };

    const key = collaborationProgramTimelineKey(this.config.getRedisKeyPrefix(), companyId, programId);
    try {
      // 采用 list（左入右出）。CollabRedisCacheService 目前只封装 get/set/del/publish，
      // 这里直接复用 underlying redis 客户端能力较麻烦，因此用 JSON array 累积（限制条数）。
      // Phase 13.1 可再升级为 list 操作（新增封装）。
      const prevRaw = await this.collabRedis.get(key);
      const prev = prevRaw ? (JSON.parse(prevRaw) as ProgramTimelineEvent[]) : [];
      const next = [event, ...(Array.isArray(prev) ? prev : [])].slice(0, PROGRAM_TIMELINE_MAX_EVENTS);
      await this.collabRedis.setPx(key, JSON.stringify(next), 30 * 86_400_000);
      this.logger.log('foundry.collaboration.program.timeline', {
        companyId,
        programId,
        kind: event.kind,
        phase: event.phase,
        traceId: event.traceId ?? null,
      });
      return event;
    } catch (e: unknown) {
      this.logger.warn('collaboration_program.timeline.append_failed', {
        companyId,
        programId,
        ...serializeUnknownErrorForLog(e),
      });
      return null;
    }
  }

  async listRecent(params: { companyId: string; programId: string; limit?: number }): Promise<ProgramTimelineEvent[]> {
    if (!this.isEnabled()) return [];
    const companyId = String(params.companyId ?? '').trim();
    const programId = String(params.programId ?? '').trim();
    if (!companyId || !programId) return [];
    const key = collaborationProgramTimelineKey(this.config.getRedisKeyPrefix(), companyId, programId);
    const raw = await this.collabRedis.get(key);
    if (!raw) return [];
    try {
      const rows = JSON.parse(raw) as ProgramTimelineEvent[];
      if (!Array.isArray(rows)) return [];
      const limit = Math.min(200, Math.max(1, Math.floor(params.limit ?? 50)));
      return rows.slice(0, limit);
    } catch {
      return [];
    }
  }
}

