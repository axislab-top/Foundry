import { Injectable, Logger } from '@nestjs/common';
import { MainRoomCeoTurnStateService } from './main-room-ceo-turn-state.service.js';
import { ConfigService } from '../../common/config/config.service.js';

export type MainRoomStrategyDraftPayload = {
  draftGoalSummary: string;
  updatedAt: string;
  sourceMessageId?: string;
};

/**
 * 主群战略目标草稿：用户通过 **与 replay 对话** 迭代目标摘要，Strategy/L1 规划前注入；规划成功后应 clear。
 */
@Injectable()
export class MainRoomStrategyDraftSessionService {
  private readonly logger = new Logger(MainRoomStrategyDraftSessionService.name);

  constructor(
    private readonly turnState: MainRoomCeoTurnStateService,
    private readonly config: ConfigService,
  ) {}

  private shouldSkipLegacySessionWrite(): boolean {
    return (
      this.config.isCollabProgramSessionProjectionOnly() &&
      this.config.isCollabProgramSsotEnabled()
    );
  }

  async getDraft(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<MainRoomStrategyDraftPayload | null> {
    return this.turnState.getDraft(params);
  }

  async setDraft(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    draftGoalSummary: string;
    sourceMessageId?: string;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    const summary = String(params.draftGoalSummary ?? '').trim().slice(0, 8000);
    if (!companyId || !roomId || !summary) return;
    if (this.shouldSkipLegacySessionWrite()) {
      this.logger.debug('main_room.strategy_draft.set_skipped_projection_only', {
        companyId,
        roomId,
      });
      return;
    }
    await this.turnState.setDraft(params, {
      draftGoalSummary: summary,
      sourceMessageId: params.sourceMessageId,
    });
  }

  async clearDraft(params: { companyId: string; roomId: string; threadId?: string | null }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    if (this.shouldSkipLegacySessionWrite()) {
      this.logger.debug('main_room.strategy_draft.clear_skipped_projection_only', {
        companyId,
        roomId,
      });
      return;
    }
    await this.turnState.clearDraft(params);
  }
}
