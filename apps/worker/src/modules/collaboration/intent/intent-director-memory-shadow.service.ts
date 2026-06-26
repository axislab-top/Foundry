import { Injectable, Logger } from '@nestjs/common';

/**
 * 影子模式：记录记忆 hits 与主管白名单关系，不改变路由。
 */
@Injectable()
export class IntentDirectorMemoryShadowService {
  private readonly logger = new Logger(IntentDirectorMemoryShadowService.name);

  async maybeLog(params: {
    enabled: boolean;
    companyId: string;
    roomId: string;
    traceId: string;
    userText: string;
    memoryHits?: ReadonlyArray<{ id?: string; content?: string }>;
    directorWhitelist: string[];
    resolutionStatus: string;
  }): Promise<void> {
    if (!params.enabled) return;
    const hitCount = Array.isArray(params.memoryHits) ? params.memoryHits.length : 0;
    this.logger.log('intent_director.memory_shadow', {
      companyId: params.companyId,
      roomId: params.roomId,
      traceId: params.traceId,
      resolutionStatus: params.resolutionStatus,
      userTextLen: params.userText.length,
      memoryHitCount: hitCount,
      whitelistCount: params.directorWhitelist.length,
    });
  }
}
