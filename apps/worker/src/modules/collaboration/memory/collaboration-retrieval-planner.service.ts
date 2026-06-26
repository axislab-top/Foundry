import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';
import type { CollaborationExecutionContext } from '../context/collaboration-execution-context.js';
import type { MemoryLayerRoomHint } from './memory-cross-cut.service.js';
import { MemoryCrossCutService, type MemorySearchHit } from './memory-cross-cut.service.js';

/**
 * 单次用户回合的统一检索入口：包装 {@link MemoryCrossCutService.retrieveBeforeIntent} 并写入审计字段。
 */
@Injectable()
export class CollaborationRetrievalPlannerService {
  constructor(
    private readonly config: ConfigService,
    private readonly memoryCrossCut: MemoryCrossCutService,
  ) {}

  async planLeadRetrieval(params: {
    companyId: string;
    roomId: string;
    roomType: string;
    contentText: string;
    traceId: string;
    roomMemberPromptBlock?: string | null;
    skipRoster?: boolean;
    layerRoomHint?: MemoryLayerRoomHint;
    collaborationExecutionContext?: CollaborationExecutionContext;
  }): Promise<{
    promptContext: string;
    hitCount: number;
    memoryHits: MemorySearchHit[];
    duplicateSkipped: boolean;
  }> {
    const out = await this.memoryCrossCut.retrieveBeforeIntent(params);
    const ctx = params.collaborationExecutionContext;
    if (ctx && this.config.isCollabRetrievalPlannerV2Enabled()) {
      ctx.retrievalPlannerVersion = '2026.v2';
    }
    return out;
  }
}
