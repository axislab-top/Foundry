import { Injectable, Logger } from '@nestjs/common';
import type { MainRoomHeavyPipelineKind } from './pipeline-v2/main-room-heavy-pipeline-entry.util.js';
import { MainRoomCeoTurnStateService } from './main-room-ceo-turn-state.service.js';
import { ConfigService } from '../../common/config/config.service.js';

export type MainRoomCeoAlignmentSessionPhase = 'awaiting_execution_confirm' | 'authorized';

export type MainRoomCeoAlignmentSessionPayload = {
  phase: MainRoomCeoAlignmentSessionPhase;
  draftGoalSummary: string;
  proposedHeavyPipelineKind: MainRoomHeavyPipelineKind;
  proposedAt: string;
  sourceMessageId?: string;
  authorizationMessageId?: string;
  authorizedAt?: string;
};

/**
 * 主群 CEO Replay 对齐状态机 Redis 会话（待确认 / 已授权）。
 * 存储经 {@link MainRoomCeoTurnStateService} 统一读写。
 */
@Injectable()
export class MainRoomCeoAlignmentSessionService {
  private readonly logger = new Logger(MainRoomCeoAlignmentSessionService.name);

  constructor(
    private readonly turnState: MainRoomCeoTurnStateService,
    private readonly config: ConfigService,
  ) {}

  async get(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<MainRoomCeoAlignmentSessionPayload | null> {
    return this.turnState.getAlignment(params);
  }

  async setProposed(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    draftGoalSummary: string;
    proposedHeavyPipelineKind: MainRoomHeavyPipelineKind;
    sourceMessageId?: string;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    const summary = String(params.draftGoalSummary ?? '').trim().slice(0, 8000);
    const kind = params.proposedHeavyPipelineKind;
    if (!companyId || !roomId || !summary || !kind) return;
    if (
      this.config.isCollabProgramSessionProjectionOnly() &&
      this.config.isCollabProgramSsotEnabled()
    ) {
      this.logger.debug('main_room.ceo_alignment.set_proposed_skipped_projection_only', {
        companyId,
        roomId,
      });
      return;
    }
    const payload: MainRoomCeoAlignmentSessionPayload = {
      phase: 'awaiting_execution_confirm',
      draftGoalSummary: summary,
      proposedHeavyPipelineKind: kind,
      proposedAt: new Date().toISOString(),
      ...(params.sourceMessageId ? { sourceMessageId: params.sourceMessageId } : {}),
    };
    await this.turnState.setAlignment(params, payload);
  }

  async markAuthorized(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    authorizationMessageId: string;
    draftGoalSummary?: string | null;
    proposedHeavyPipelineKind?: MainRoomHeavyPipelineKind;
  }): Promise<void> {
    if (
      this.config.isCollabProgramSessionProjectionOnly() &&
      this.config.isCollabProgramSsotEnabled()
    ) {
      this.logger.debug('main_room.ceo_alignment.mark_authorized_skipped_projection_only', {
        companyId: params.companyId,
        roomId: params.roomId,
      });
      return;
    }
    const existing = await this.get(params);
    const summary = String(
      params.draftGoalSummary?.trim() || existing?.draftGoalSummary?.trim() || '',
    ).slice(0, 8000);
    const kind = params.proposedHeavyPipelineKind ?? existing?.proposedHeavyPipelineKind;
    if (!existing) {
      if (!summary || !kind) {
        this.logger.warn('main_room.ceo_alignment.mark_authorized_no_session', {
          companyId: params.companyId,
          roomId: params.roomId,
          authorizationMessageId: params.authorizationMessageId,
        });
        return;
      }
      await this.turnState.setAlignment(params, {
        phase: 'authorized',
        draftGoalSummary: summary,
        proposedHeavyPipelineKind: kind,
        proposedAt: new Date().toISOString(),
        authorizationMessageId: params.authorizationMessageId,
        authorizedAt: new Date().toISOString(),
      });
      return;
    }
    await this.turnState.setAlignment(params, {
      ...existing,
      ...(summary ? { draftGoalSummary: summary } : {}),
      ...(kind ? { proposedHeavyPipelineKind: kind } : {}),
      phase: 'authorized',
      authorizationMessageId: params.authorizationMessageId,
      authorizedAt: new Date().toISOString(),
    });
  }

  async clear(params: { companyId: string; roomId: string; threadId?: string | null }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    if (
      this.config.isCollabProgramSessionProjectionOnly() &&
      this.config.isCollabProgramSsotEnabled()
    ) {
      this.logger.debug('main_room.ceo_alignment.clear_skipped_projection_only', { companyId, roomId });
      return;
    }
    await this.turnState.clearAlignment(params);
  }
}
