import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { CeoDispatchAssignment, MainRoomDispatchPlanStateDto } from '@contracts/types';
import {
  MAIN_ROOM_DISPATCH_PLAN_DEFAULT_QUICK_ACTIONS,
  normalizeCollaborationThreadId,
} from '@contracts/types';
import { mainRoomDispatchPlanSessionKey } from '@contracts/types/collab-redis-keys';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';
import { MainRoomSessionAccessService } from './main-room-session-access.service.js';
import { readCollabRedisJsonSession } from '../utils/collab-redis-session.util.js';

const SESSION_TTL_MS = 86_400_000;

type DispatchPlanSessionPayload = {
  version: 1;
  planId: string;
  planRevision: number;
  goal: string;
  bodyMarkdown: string;
  executionOrder?: 'sequential' | 'parallel' | 'dag';
  assignments: CeoDispatchAssignment[];
  mainGoalTaskId?: string;
  dispatched: boolean;
  breakdownDispatched?: boolean;
  pendingDistributionConfirm?: boolean;
  pendingDistributionLegacy?: { tasks?: Array<{ department?: string; priority?: string; deliverable?: string }> } | null;
  dispatchPlanDraftQuickActions?: Array<{ actionId: string; label: string; sendText: string }>;
  orchestrationInProgressQuickActions?: Array<{ actionId: string; label: string; sendText: string }>;
  sourceMessageId: string;
  updatedAt: string;
};

@Injectable()
export class MainRoomDispatchPlanPatchService {
  private readonly logger = new Logger(MainRoomDispatchPlanPatchService.name);

  constructor(
    private readonly collabRedis: CollabRedisCacheService,
    private readonly config: ConfigService,
    private readonly sessionAccess: MainRoomSessionAccessService,
    private readonly realtime: CollaborationRealtimePublisher,
  ) {}

  private sessionKey(companyId: string, roomId: string, threadId: string): string {
    return mainRoomDispatchPlanSessionKey(
      this.config.getRedisKeyPrefix(),
      companyId,
      roomId,
      threadId,
    );
  }

  private parseSession(raw: string): DispatchPlanSessionPayload | null {
    try {
      return JSON.parse(raw) as DispatchPlanSessionPayload;
    } catch {
      return null;
    }
  }

  private async readSession(
    companyId: string,
    roomId: string,
    threadId?: string | null,
  ): Promise<{
    session: DispatchPlanSessionPayload | null;
    resolvedThreadId: string;
    resolvedVia: 'thread' | 'main_fallback' | 'none';
  }> {
    const { session, resolvedThreadId, resolvedVia } = await readCollabRedisJsonSession({
      collabRedis: this.collabRedis,
      threadId,
      strictThreadIsolation: this.config.isCollabStrictThreadIsolationEnabled(),
      redisKey: (tid) => this.sessionKey(companyId, roomId, tid),
      parse: (raw) => this.parseSession(raw),
    });
    return { session, resolvedThreadId, resolvedVia };
  }

  private async writeSession(
    companyId: string,
    roomId: string,
    threadId: string,
    payload: DispatchPlanSessionPayload,
  ): Promise<void> {
    const ok = await this.collabRedis.setPx(
      this.sessionKey(companyId, roomId, threadId),
      JSON.stringify(payload),
      SESSION_TTL_MS,
    );
    if (!ok) {
      this.logger.warn('main_room.dispatch_plan.api_write_failed', { companyId, roomId, threadId });
    }
  }

  async getDraftState(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    actorUserId: string;
  }): Promise<MainRoomDispatchPlanStateDto> {
    await this.sessionAccess.assertMainRoomHumanMember({
      companyId: params.companyId,
      roomId: params.roomId,
      actorUserId: params.actorUserId,
      forbiddenMessage: '非本群成员，无法访问执行计划草稿',
      notMainRoomMessage: '仅主群支持 Dispatch Plan 草稿',
    });
    const { session: sess, resolvedThreadId, resolvedVia } = await this.readSession(
      params.companyId,
      params.roomId,
      params.threadId,
    );
    if (!sess) {
      return {
        hasSession: false,
        dispatched: false,
        pendingDistributionConfirm: false,
        planId: null,
        planRevision: null,
        mainGoalTaskId: null,
        updatedAt: null,
        sourceMessageId: null,
        resolvedThreadId,
        resolvedVia,
        goal: null,
        bodyMarkdown: null,
        executionOrder: null,
        assignments: null,
        distributionPreview: null,
        dispatchPlanDraftQuickActions: null,
      };
    }
    const tasks = Array.isArray(sess.pendingDistributionLegacy?.tasks) ? sess.pendingDistributionLegacy!.tasks! : [];
    const distributionPreview =
      sess.pendingDistributionConfirm && tasks.length
        ? tasks.slice(0, 24).map((t) => ({
            department: String(t?.department ?? '').trim() || '—',
            priority: String(t?.priority ?? 'P1').trim() || 'P1',
            deliverable: String(t?.deliverable ?? '').trim() || '—',
          }))
        : null;
    const qa = (() => {
      if (sess.dispatched === true) {
        const inProgress = Array.isArray(sess.orchestrationInProgressQuickActions)
          ? sess.orchestrationInProgressQuickActions
              .map((x) => ({
                actionId: String(x?.actionId ?? '').trim(),
                label: String(x?.label ?? '').trim(),
                sendText: String(x?.sendText ?? '').trim(),
              }))
              .filter((x) => x.label && x.sendText)
              .slice(0, 12)
          : [];
        return inProgress;
      }
      return Array.isArray(sess.dispatchPlanDraftQuickActions)
        ? sess.dispatchPlanDraftQuickActions
            .map((x) => ({
              actionId: String(x?.actionId ?? '').trim(),
              label: String(x?.label ?? '').trim(),
              sendText: String(x?.sendText ?? '').trim(),
            }))
            .filter((x) => x.label && x.sendText)
            .slice(0, 12)
        : MAIN_ROOM_DISPATCH_PLAN_DEFAULT_QUICK_ACTIONS;
    })();
    return {
      hasSession: true,
      dispatched: sess.dispatched === true,
      pendingDistributionConfirm: Boolean(sess.pendingDistributionConfirm),
      planId: sess.planId?.trim() || null,
      planRevision: typeof sess.planRevision === 'number' ? sess.planRevision : null,
      mainGoalTaskId: sess.mainGoalTaskId?.trim() || null,
      updatedAt: sess.updatedAt?.trim() || null,
      sourceMessageId: sess.sourceMessageId?.trim() || null,
      resolvedThreadId,
      resolvedVia,
      goal: sess.goal?.trim() || null,
      bodyMarkdown: sess.bodyMarkdown?.trim() || null,
      executionOrder: sess.executionOrder ?? null,
      assignments: Array.isArray(sess.assignments) ? sess.assignments : null,
      distributionPreview,
      dispatchPlanDraftQuickActions: qa.length ? qa : null,
    };
  }

  async patchDispatchPlanDraft(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    actorUserId: string;
    goal: string;
    bodyMarkdown?: string;
    assignments: CeoDispatchAssignment[];
    executionOrder?: 'sequential' | 'parallel' | 'dag';
  }): Promise<MainRoomDispatchPlanStateDto> {
    await this.sessionAccess.assertMainRoomHumanMember({
      companyId: params.companyId,
      roomId: params.roomId,
      actorUserId: params.actorUserId,
      forbiddenMessage: '非本群成员，无法编辑执行计划草稿',
      notMainRoomMessage: '仅主群支持 Dispatch Plan 草稿',
    });
    const tid = normalizeCollaborationThreadId(params.threadId);
    const { session: sess } = await this.readSession(params.companyId, params.roomId, tid);
    if (!sess) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '当前没有可编辑的执行计划草稿（可能已过期或尚未生成）',
      });
    }
    if (sess.dispatched) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '执行计划已下发，无法再编辑；如需调整请发起新一轮任务',
      });
    }
    const goal = String(params.goal ?? '').trim().slice(0, 8000);
    if (!goal) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '目标不能为空' });
    }
    const assignments = (Array.isArray(params.assignments) ? params.assignments : [])
      .map((a) => ({
        departmentSlug: String(a?.departmentSlug ?? '').trim().slice(0, 80),
        title: String(a?.title ?? '').trim().slice(0, 200),
        objective: String(a?.objective ?? '').trim().slice(0, 4000),
        acceptanceCriteria: (Array.isArray(a?.acceptanceCriteria) ? a.acceptanceCriteria : [])
          .map((c) => String(c ?? '').trim())
          .filter(Boolean)
          .slice(0, 12),
        dependsOnSlugs: Array.isArray(a?.dependsOnSlugs)
          ? a.dependsOnSlugs.map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 8)
          : undefined,
        priority: a?.priority,
      }))
      .filter((a) => a.departmentSlug && a.title && a.objective)
      .slice(0, 24);
    if (assignments.length === 0) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '至少保留一条部门分工' });
    }
    const next: DispatchPlanSessionPayload = {
      ...sess,
      goal,
      bodyMarkdown: String(params.bodyMarkdown ?? sess.bodyMarkdown ?? '').trim().slice(0, 32_000),
      assignments,
      executionOrder: params.executionOrder ?? sess.executionOrder,
      planRevision: (sess.planRevision ?? 0) + 1,
      pendingDistributionConfirm: false,
      pendingDistributionLegacy: null,
      dispatchPlanDraftQuickActions: MAIN_ROOM_DISPATCH_PLAN_DEFAULT_QUICK_ACTIONS,
      updatedAt: new Date().toISOString(),
    };
    await this.writeSession(params.companyId, params.roomId, tid, next);
    void this.realtime
      .publishEnvelope({
        companyId: params.companyId,
        roomId: params.roomId,
        event: 'dispatch_plan_draft:updated',
        kind: 'dispatch_plan',
        updatedAt: next.updatedAt,
        planRevision: next.planRevision,
        threadId: tid,
      })
      .catch(() => undefined);
    return this.getDraftState({
      companyId: params.companyId,
      roomId: params.roomId,
      threadId: tid,
      actorUserId: params.actorUserId,
    });
  }
}
