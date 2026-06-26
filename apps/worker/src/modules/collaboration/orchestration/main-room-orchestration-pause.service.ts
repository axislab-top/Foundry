import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { MAIN_ROOM_ORCHESTRATION_IN_PROGRESS_QUICK_ACTIONS } from '@contracts/types';
import { mainRoomOrchestrationPauseSessionKey } from '@contracts/types/collab-redis-keys';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { upsertMainRoomOrchestrationLifecycleBestEffort } from '../main-room-orchestration-lifecycle-upsert.util.js';
import {
  isOrchestrationPauseSignal,
  isOrchestrationRevokeSignal,
} from '../replay/user-proceed-intent.util.js';

export type MainRoomOrchestrationPauseSession = {
  paused: true;
  revoke: boolean;
  sourceMessageId: string;
  mainGoalTaskId?: string | null;
  pausedAt: string;
  pausedByMessageId: string;
  reason?: string | null;
};

@Injectable()
export class MainRoomOrchestrationPauseService {
  private readonly logger = new Logger(MainRoomOrchestrationPauseService.name);
  private readonly pauseTtlMs = 86_400_000;

  constructor(
    private readonly config: ConfigService,
    private readonly collabRedis: CollabRedisCacheService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private threadId(threadId?: string | null): string {
    return ((threadId ?? '').trim() || 'main') as string;
  }

  private pauseKey(companyId: string, roomId: string, threadId?: string | null): string {
    return mainRoomOrchestrationPauseSessionKey(
      this.config.getRedisKeyPrefix(),
      companyId,
      roomId,
      this.threadId(threadId),
    );
  }

  private workerActor(): { id: string; roles: string[] } {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] };
  }

  async isPaused(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<boolean> {
    if (!this.config.isCollabMainRoomOrchestrationPauseEnabled()) return false;
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return false;
    const raw = await this.collabRedis.get(this.pauseKey(companyId, roomId, params.threadId));
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as MainRoomOrchestrationPauseSession;
      return parsed?.paused === true;
    } catch {
      return false;
    }
  }

  async readPauseSession(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
  }): Promise<MainRoomOrchestrationPauseSession | null> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return null;
    const raw = await this.collabRedis.get(this.pauseKey(companyId, roomId, params.threadId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as MainRoomOrchestrationPauseSession;
      return parsed?.paused === true ? parsed : null;
    } catch {
      return null;
    }
  }

  private async setPaused(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    session: MainRoomOrchestrationPauseSession;
  }): Promise<void> {
    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    if (!companyId || !roomId) return;
    await this.collabRedis.setPx(
      this.pauseKey(companyId, roomId, params.threadId),
      JSON.stringify(params.session),
      this.pauseTtlMs,
    );
  }

  /**
   * 老板暂停/撤回进行中编排：写 Redis 门控、暂停主目标任务、更新 orchestration run。
   */
  async pauseActiveOrchestration(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    messageId: string;
    traceId: string;
    userText?: string | null;
    confirmationIntent?: string | null;
  }): Promise<{
    attempted: boolean;
    ok: boolean;
    revoke: boolean;
    sourceMessageId?: string;
    mainGoalTaskId?: string;
    reason?: string;
  }> {
    if (!this.config.isCollabMainRoomOrchestrationPauseEnabled()) {
      return { attempted: false, ok: false, revoke: false };
    }
    if (
      !isOrchestrationPauseSignal({
        confirmationIntent: params.confirmationIntent,
        userText: params.userText,
      })
    ) {
      return { attempted: false, ok: false, revoke: false };
    }

    const companyId = String(params.companyId ?? '').trim();
    const roomId = String(params.roomId ?? '').trim();
    const messageId = String(params.messageId ?? '').trim();
    const traceId = String(params.traceId ?? messageId).trim();
    if (!companyId || !roomId || !messageId) {
      return { attempted: true, ok: false, revoke: false, reason: 'missing_scope' };
    }

    const revoke = isOrchestrationRevokeSignal({
      confirmationIntent: params.confirmationIntent,
      userText: params.userText,
    });

    // Dispatch plan session service removed — always null
    const dispatchSession = null;
    const mainGoalTaskId = '';
    const sourceMessageId = '';
    const orchestrationActive = false;

    if (!orchestrationActive) {
      return { attempted: true, ok: false, revoke, reason: 'no_active_orchestration' };
    }

    const pauseSession: MainRoomOrchestrationPauseSession = {
      paused: true,
      revoke,
      sourceMessageId: sourceMessageId || messageId,
      mainGoalTaskId: mainGoalTaskId || null,
      pausedAt: new Date().toISOString(),
      pausedByMessageId: messageId,
      reason: revoke ? 'boss_revoke' : 'boss_pause',
    };
    await this.setPaused({ companyId, roomId, threadId: params.threadId, session: pauseSession });

    if (mainGoalTaskId) {
      await this.pauseMainGoalTaskBestEffort({
        companyId,
        taskId: mainGoalTaskId,
        revoke,
        traceId,
      });
    }

    const orchSourceMessageId = sourceMessageId || messageId;
    upsertMainRoomOrchestrationLifecycleBestEffort({
      apiRpc: this.apiRpc,
      logger: this.logger,
      workerActorUserId: this.workerActor().id,
      rpcTimeoutMs: this.config.getCollaborationMentionRpcTimeoutMs(),
      companyId,
      roomId,
      sourceMessageId: orchSourceMessageId,
      lifecycle: 'paused',
      terminalKind: 'orchestration_paused',
      stage: 'orchestration_paused',
      metadataPatch: {
        routePath: 'orchestration_paused',
        orchestrationPaused: true,
        orchestrationRevoked: revoke,
        pausedByMessageId: messageId,
        mainGoalTaskId: mainGoalTaskId || null,
        orchestrationInProgressQuickActions: MAIN_ROOM_ORCHESTRATION_IN_PROGRESS_QUICK_ACTIONS,
      },
      logContext: 'orchestration_pause',
    });

    this.logger.log('foundry.collaboration.main_room.orchestration_paused', {
      companyId,
      roomId,
      messageId,
      traceId,
      revoke,
      sourceMessageId: orchSourceMessageId,
      mainGoalTaskId: mainGoalTaskId || null,
    });

    return {
      attempted: true,
      ok: true,
      revoke,
      sourceMessageId: orchSourceMessageId,
      mainGoalTaskId: mainGoalTaskId || undefined,
    };
  }

  private async pauseMainGoalTaskBestEffort(params: {
    companyId: string;
    taskId: string;
    revoke: boolean;
    traceId: string;
  }): Promise<void> {
    const rpcTimeout = Math.max(4_000, Math.min(30_000, this.config.getCollaborationMentionRpcTimeoutMs()));
    const status = params.revoke ? 'cancelled' : 'paused';
    const blockedReason = params.revoke
      ? '老板已撤回当前编排任务'
      : '老板已暂停当前编排';
    try {
      await firstValueFrom(
        this.apiRpc
          .send('tasks.update', {
            companyId: params.companyId,
            actor: this.workerActor(),
            id: params.taskId,
            data: {
              status,
              blockedReason: blockedReason.slice(0, 2000),
              metadata: {
                orchestrationPause: {
                  at: new Date().toISOString(),
                  traceId: params.traceId,
                  revoke: params.revoke,
                },
              },
            },
          })
          .pipe(timeout({ first: rpcTimeout })),
      );
    } catch (e: unknown) {
      this.logger.warn('main_room.orchestration_pause.task_update_failed', {
        companyId: params.companyId,
        taskId: params.taskId,
        status,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
