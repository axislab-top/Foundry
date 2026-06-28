import { Injectable, Logger } from '@nestjs/common';
import type { ProgramTimelineEvent } from '@contracts/types';
import { collaborationProgramTimelineKey } from '@contracts/types/collab-redis-keys';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class CollaborationProgramTimelineReadService {
  private readonly logger = new Logger(CollaborationProgramTimelineReadService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly collabRedis: CollabRedisCacheService,
  ) {}

  async listRecent(params: {
    companyId: string;
    programId: string;
    limit?: number;
  }): Promise<ProgramTimelineEvent[]> {
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
    } catch (e: unknown) {
      this.logger.warn('collaboration_program.timeline.read_failed', {
        companyId,
        programId,
        err: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }
}
