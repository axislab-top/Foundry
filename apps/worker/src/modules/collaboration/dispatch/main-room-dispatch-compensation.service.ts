import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import { CollabNotifyPublisherService } from '../collab-notify-publisher.service.js';
import type { MainRoomDispatchSkipRow } from '../main-room-dispatch-skip.types.js';
import { withCollaborationRpcRetries } from '../utils/collaboration-rpc-retry.util.js';
import { buildMainRoomDispatchSkippedNoticeLines } from './main-room-dispatch-skip-label.util.js';
import { CollaborationProgramLifecycleService } from '../program/collaboration-program-lifecycle.service.js';

const COMPENSATION_DEDUPE_TTL_MS = 7 * 86_400_000;

function compensationNoticeDedupeKey(
  prefix: string,
  companyId: string,
  scopeKey: string,
): string {
  return `${prefix}collab:main_room_dispatch_compensation:v1:${companyId}:${scopeKey}`;
}

@Injectable()
export class MainRoomDispatchCompensationService {
  private readonly logger = new Logger(MainRoomDispatchCompensationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    private readonly collabNotify: CollabNotifyPublisherService,
    private readonly programLifecycle: CollaborationProgramLifecycleService,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  getAppendRetryAttempts(): number {
    return this.config.getCollabMainRoomAppendAgentRetryAttempts();
  }

  private workerActor() {
    return {
      id: process.env.WORKER_ACTOR_USER_ID ?? '00000000-0000-0000-0000-000000000000',
      roles: ['admin'] as string[],
    };
  }

  private rpcTimeoutMs(): number {
    return Math.max(4_000, Math.min(20_000, this.config.getCollaborationMentionRpcTimeoutMs()));
  }

  async appendAgentWithRetry<T = { id?: string }>(params: {
    payload: Record<string, unknown>;
    logContext: string;
  }): Promise<T> {
    const rpcTimeout = this.rpcTimeoutMs();
    return await withCollaborationRpcRetries(
      async () =>
        await firstValueFrom(
          this.apiRpc.send<T>('collaboration.messages.appendAgent', params.payload).pipe(
            timeout({ first: rpcTimeout }),
          ),
        ),
      { attempts: this.getAppendRetryAttempts() },
    );
  }

  /**
   * 派发部分失败：主群 CEO 可见提示 + WS `dispatch:partial_failed`（与 API metadata patch 路径对齐）。
   */
  async notifyDispatchPartialFailure(params: {
    companyId: string;
    mainRoomId: string;
    threadId?: string | null;
    ceoAgentId: string;
    planMessageId?: string | null;
    parentGoalTaskId?: string | null;
    skipped: MainRoomDispatchSkipRow[];
    slugToLabel?: Map<string, string>;
    retried?: boolean;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const companyId = String(params.companyId ?? '').trim();
    const mainRoomId = String(params.mainRoomId ?? '').trim();
    const ceoId = String(params.ceoAgentId ?? '').trim();
    const skipped = params.skipped.slice(0, 24);
    if (!companyId || !mainRoomId || !ceoId || !skipped.length) return;

    const scopeKey = String(params.planMessageId ?? params.parentGoalTaskId ?? 'dispatch').trim();
    const dedupeKey = compensationNoticeDedupeKey(this.config.getRedisKeyPrefix(), companyId, scopeKey);
    const acquired = await this.redisCache.setNxPx(dedupeKey, '1', COMPENSATION_DEDUPE_TTL_MS);
    if (!acquired) return;

    const wsRows = skipped.map((row) => ({
      departmentSlug: row.departmentSlug.slice(0, 64),
      reason: row.reason,
      ...(row.planTaskId ? { planTaskId: row.planTaskId.slice(0, 128) } : {}),
    }));

    if (params.planMessageId) {
      await this.patchDispatchFlushSkippedMetadataWithRetry({
        companyId,
        planMessageId: params.planMessageId,
        skipped: wsRows,
      });
    }

    await this.collabNotify.publishDispatchPartialFailed({
      companyId,
      roomId: mainRoomId,
      messageId: params.planMessageId ?? undefined,
      skipped: wsRows,
    });

    const lines = buildMainRoomDispatchSkippedNoticeLines(skipped, params.slugToLabel);
    const retryHint = params.retried ? '系统已自动重试仍失败' : '系统已记录异常';
    const content = (
      `【派发异常】${skipped.length} 个部门未能自动派发（${retryHint}），请检查部门群与主管配置，或在任务中心补发。\n` +
      lines.join('\n')
    ).slice(0, 8000);

    try {
      await this.appendAgentWithRetry({
        payload: {
          companyId,
          actor: this.workerActor(),
          roomId: mainRoomId,
          agentId: ceoId,
          content,
          messageType: 'text',
          threadId: params.threadId ?? undefined,
          metadata: {
            kind: 'main_room_dispatch_compensation',
            mainRoomDeptDispatch: false,
            dispatchFlushSkipped: wsRows,
            parentGoalTaskId: params.parentGoalTaskId ?? null,
            ...(params.planMessageId ? { linkedPlanMessageId: params.planMessageId } : {}),
          },
        },
        logContext: 'dispatch_compensation',
      });
      this.logger.log('foundry.collaboration.main_room.dispatch_compensation', {
        companyId,
        mainRoomId,
        skippedCount: skipped.length,
        planMessageId: params.planMessageId ?? null,
      });
      void this.programLifecycle.onCompensation({
        companyId,
        roomId: mainRoomId,
        threadId: params.threadId,
        headline: '部分部门派发失败，已写入补偿提示',
        scopeKey: `partial_dispatch:${params.planMessageId ?? params.parentGoalTaskId ?? 'unknown'}`,
      });
    } catch (e: unknown) {
      this.logger.warn('main_room.dispatch_compensation.append_failed', {
        companyId,
        mainRoomId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async notifyAppendFailure(params: {
    companyId: string;
    mainRoomId: string;
    threadId?: string | null;
    ceoAgentId: string;
    scopeKey: string;
    headline: string;
    detail?: string;
    kind: string;
  }): Promise<void> {
    if (!this.isEnabled()) return;
    const companyId = String(params.companyId ?? '').trim();
    const mainRoomId = String(params.mainRoomId ?? '').trim();
    const ceoId = String(params.ceoAgentId ?? '').trim();
    const scopeKey = String(params.scopeKey ?? '').trim();
    if (!companyId || !mainRoomId || !ceoId || !scopeKey) return;

    const dedupeKey = compensationNoticeDedupeKey(this.config.getRedisKeyPrefix(), companyId, scopeKey);
    const acquired = await this.redisCache.setNxPx(dedupeKey, '1', COMPENSATION_DEDUPE_TTL_MS);
    if (!acquired) return;

    const content = (
      `${params.headline}${params.detail ? `：${params.detail.slice(0, 500)}` : ''}（系统已自动重试仍失败，请稍后重试或联系支持。）`
    ).slice(0, 2000);

    try {
      await this.appendAgentWithRetry({
        payload: {
          companyId,
          actor: this.workerActor(),
          roomId: mainRoomId,
          agentId: ceoId,
          content,
          messageType: 'text',
          threadId: params.threadId ?? undefined,
          metadata: {
            kind: params.kind,
            mainRoomDeptDispatch: false,
          },
        },
        logContext: params.kind,
      });
      void this.programLifecycle.onCompensation({
        companyId,
        roomId: mainRoomId,
        threadId: params.threadId,
        headline: params.headline,
        scopeKey: params.scopeKey,
      });
    } catch (e: unknown) {
      this.logger.warn('main_room.compensation.append_failed', {
        companyId,
        mainRoomId,
        kind: params.kind,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * 阶段 9：deferred heavy 编排失败时主群 CEO 可见提示（listener catch 路径）。
   */
  async notifyDeferredHeavyFailure(params: {
    companyId: string;
    mainRoomId: string;
    threadId?: string | null;
    ceoAgentId: string;
    sourceMessageId: string;
    heavyKind: string;
    traceId?: string | null;
    errMessage?: string;
  }): Promise<void> {
    const heavyKind = String(params.heavyKind ?? '').trim() || 'unknown';
    const scopeKey = `deferred_heavy:${String(params.sourceMessageId).trim()}:${heavyKind}`;
    await this.notifyAppendFailure({
      companyId: params.companyId,
      mainRoomId: params.mainRoomId,
      threadId: params.threadId,
      ceoAgentId: params.ceoAgentId,
      scopeKey,
      headline: '【编排异常】后台任务编排未能完成',
      detail: `类型 ${heavyKind}${params.errMessage ? `（${params.errMessage.slice(0, 200)}）` : ''}`,
      kind: 'main_room_deferred_heavy_failed',
    });
  }

  private async patchDispatchFlushSkippedMetadataWithRetry(params: {
    companyId: string;
    planMessageId: string;
    skipped: Array<{ departmentSlug: string; reason: string; planTaskId?: string }>;
  }): Promise<void> {
    const messageId = String(params.planMessageId ?? '').trim();
    if (!messageId || !params.skipped.length) return;
    try {
      await withCollaborationRpcRetries(
        async () =>
          await firstValueFrom(
            this.apiRpc
              .send('collaboration.messages.patchMetadata', {
                companyId: params.companyId,
                actor: this.workerActor(),
                messageId,
                metadata: { dispatchFlushSkipped: params.skipped },
              })
              .pipe(timeout({ first: this.rpcTimeoutMs() })),
          ),
        { attempts: this.getAppendRetryAttempts() },
      );
    } catch (e: unknown) {
      this.logger.warn('main_room.dispatch_compensation.patch_skipped_metadata_failed', {
        companyId: params.companyId,
        messageId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
