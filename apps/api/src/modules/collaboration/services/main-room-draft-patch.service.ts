import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { DistributionPlan, MainRoomDraftStateDto, PlanningResult } from '@contracts/types';
import { migrateLegacyPlanningResultToStrategicPhases } from '@contracts/types';
import { mainRoomStrategyGoalSessionKey } from '@contracts/types/collab-redis-keys';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationRealtimePublisher } from './collaboration-realtime-publisher.service.js';
import { MainRoomSessionAccessService } from './main-room-session-access.service.js';
import { readCollabRedisJsonSession } from '../utils/collab-redis-session.util.js';

/** 必须与 Worker / `@contracts/types` 的 `mainRoomStrategyGoalSessionKey` 保持一致 */
const SESSION_TTL_MS = 86_400_000;

type Planning2026Shape = {
  traceId: string;
  strategyGoal: string;
  strategicPhases: Array<{ phaseId: string; title: string; outcome: string; deadline?: string }>;
  planDigest?: { goal: string; topRiskLevel: string | null; strategicPhaseCount: number; constraintCount: number };
};

type StrategyGoalDraftQuickAction = { actionId: string; label: string; sendText: string };

type GoalSessionPayload = {
  version: 1 | 2;
  orchestrated: boolean;
  mainGoalTaskId?: string;
  breakdownDispatched?: boolean;
  pendingDistributionConfirm?: boolean;
  pendingDistributionLegacy?: DistributionPlan | null;
  planning2026: Planning2026Shape;
  legacyPlanning: PlanningResult;
  intentDecision2026: Record<string, unknown>;
  planId: string;
  traceId: string;
  sourceStrategyMessageId: string;
  updatedAt: string;
  strategyGoalDraftQuickActions?: StrategyGoalDraftQuickAction[];
};

function isGoalSessionPayload(x: unknown): x is GoalSessionPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.version !== 1 && o.version !== 2) return false;
  const p = o.planning2026;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  const pr = p as Record<string, unknown>;
  return Array.isArray(pr.strategicPhases) || Array.isArray(pr.keyResults);
}

function normalizePlanning2026Shape(raw: Record<string, unknown>): Planning2026Shape {
  const traceId = String(raw.traceId ?? '').trim();
  const strategyGoal = String(raw.strategyGoal ?? '').trim();
  if (Array.isArray(raw.strategicPhases) && (raw.strategicPhases as unknown[]).length) {
    const strategicPhases = (raw.strategicPhases as Array<Record<string, unknown>>).map((ph, i) => ({
      phaseId: String(ph.phaseId ?? `p${i + 1}`).trim() || `p${i + 1}`,
      title: String(ph.title ?? ph.name ?? '').trim().slice(0, 200),
      outcome: String(ph.outcome ?? ph.target ?? '').trim().slice(0, 4000),
      deadline: ph.deadline ? String(ph.deadline).trim().slice(0, 64) : undefined,
    }));
    const digestRaw = raw.planDigest;
    let planDigest: Planning2026Shape['planDigest'];
    if (digestRaw && typeof digestRaw === 'object' && !Array.isArray(digestRaw)) {
      const d = digestRaw as Record<string, unknown>;
      planDigest = {
        goal: String(d.goal ?? strategyGoal).slice(0, 800),
        topRiskLevel: typeof d.topRiskLevel === 'string' ? d.topRiskLevel : null,
        strategicPhaseCount: strategicPhases.length,
        constraintCount: typeof d.constraintCount === 'number' ? d.constraintCount : 0,
      };
    }
    return { traceId, strategyGoal, strategicPhases, planDigest };
  }
  const krs = Array.isArray(raw.keyResults) ? (raw.keyResults as Array<Record<string, unknown>>) : [];
  const strategicPhases = krs.map((k, i) => ({
    phaseId: `p${i + 1}`,
    title: String(k.name ?? `阶段 ${i + 1}`).trim().slice(0, 200),
    outcome: String(k.target ?? '').trim().slice(0, 4000),
    deadline: k.deadline ? String(k.deadline).trim().slice(0, 64) : undefined,
  }));
  const digestRaw = raw.planDigest;
  let planDigest: Planning2026Shape['planDigest'];
  if (digestRaw && typeof digestRaw === 'object' && !Array.isArray(digestRaw)) {
    const d = digestRaw as Record<string, unknown>;
    planDigest = {
      goal: String(d.goal ?? strategyGoal).slice(0, 800),
      topRiskLevel: typeof d.topRiskLevel === 'string' ? d.topRiskLevel : null,
      strategicPhaseCount: strategicPhases.length,
      constraintCount: typeof d.constraintCount === 'number' ? d.constraintCount : 0,
    };
  }
  return { traceId, strategyGoal, strategicPhases, planDigest };
}

function normalizeLegacyPlanningForSession(legacy: PlanningResult): PlanningResult {
  if (Array.isArray(legacy.strategicPhases) && legacy.strategicPhases.length) return legacy;
  const migrated = migrateLegacyPlanningResultToStrategicPhases(legacy as unknown as Record<string, unknown>);
  if (!migrated?.length) return legacy;
  return { ...legacy, schemaVersion: '2.1', strategicPhases: migrated };
}

function normalizePriority(p: string): 'P0' | 'P1' | 'P2' {
  const u = String(p ?? '')
    .trim()
    .toUpperCase();
  if (u === 'P0' || u === 'P1' || u === 'P2') return u;
  if (/高|紧急|urgent/i.test(p)) return 'P0';
  return 'P1';
}

@Injectable()
export class MainRoomDraftPatchService {
  private readonly logger = new Logger(MainRoomDraftPatchService.name);

  constructor(
    private readonly collabRedis: CollabRedisCacheService,
    private readonly config: ConfigService,
    private readonly sessionAccess: MainRoomSessionAccessService,
    private readonly realtime: CollaborationRealtimePublisher,
  ) {}

  private redisKeyPrefix(): string {
    return this.config.getRedisKeyPrefix();
  }

  private sessionKey(companyId: string, roomId: string, threadId: string | null | undefined): string {
    return mainRoomStrategyGoalSessionKey(this.redisKeyPrefix(), companyId, roomId, (threadId ?? '').trim() || 'main');
  }

  private async readSession(
    companyId: string,
    roomId: string,
    threadId: string | null | undefined,
  ): Promise<GoalSessionPayload | null> {
    const { session } = await readCollabRedisJsonSession({
      collabRedis: this.collabRedis,
      threadId,
      redisKey: (tid) => this.sessionKey(companyId, roomId, tid),
      parse: (raw) => {
        let j: unknown;
        try {
          j = JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
        if (!isGoalSessionPayload(j)) return null;
        return {
          ...(j as GoalSessionPayload),
          version: 2,
          planning2026: normalizePlanning2026Shape(
            (j as GoalSessionPayload).planning2026 as unknown as Record<string, unknown>,
          ),
          legacyPlanning: normalizeLegacyPlanningForSession((j as GoalSessionPayload).legacyPlanning),
        } as GoalSessionPayload;
      },
    });
    return session;
  }

  private async writeSession(
    companyId: string,
    roomId: string,
    threadId: string | null | undefined,
    payload: GoalSessionPayload,
  ): Promise<void> {
    /** 与 Worker `CollabRedisCacheService.setPx` 一致：Redis 中存 JSON 字符串 */
    const ok = await this.collabRedis.setPx(
      this.sessionKey(companyId, roomId, threadId),
      JSON.stringify(payload),
      SESSION_TTL_MS,
    );
    if (!ok) {
      this.logger.warn('main_room_draft.cache_set_failed', { companyId, roomId });
    }
  }

  private async assertMainRoomHuman(
    companyId: string,
    roomId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.sessionAccess.assertMainRoomHumanMember({
      companyId,
      roomId,
      actorUserId,
      forbiddenMessage: '非本群成员，无法修改草稿',
      notMainRoomMessage: '仅主群支持战略目标 / 部门分工草稿的手动编辑',
    });
  }

  async getDraftState(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    actorUserId: string;
  }): Promise<MainRoomDraftStateDto> {
    await this.assertMainRoomHuman(params.companyId, params.roomId, params.actorUserId);
    const sess = await this.readSession(params.companyId, params.roomId, params.threadId);
    if (!sess) {
      return {
        hasSession: false,
        orchestrated: false,
        pendingDistributionConfirm: false,
        planId: null,
        mainGoalTaskId: null,
        updatedAt: null,
        traceId: null,
        sourceStrategyMessageId: null,
        planning2026: null,
        legacyPlanning: null,
        distributionPreview: null,
        strategyGoalDraftQuickActions: null,
      };
    }
    const tasks = Array.isArray(sess.pendingDistributionLegacy?.tasks) ? sess.pendingDistributionLegacy!.tasks : [];
    const distributionPreview =
      sess.pendingDistributionConfirm && tasks.length
        ? tasks.slice(0, 24).map((t) => ({
            department: String(t?.department ?? '').trim() || '—',
            priority: String(t?.priority ?? 'P1').trim() || 'P1',
            deliverable: String(t?.deliverable ?? '').trim() || '—',
          }))
        : null;
    const qa = Array.isArray(sess.strategyGoalDraftQuickActions)
      ? sess.strategyGoalDraftQuickActions
          .map((x) => ({
            actionId: String((x as StrategyGoalDraftQuickAction)?.actionId ?? '').trim(),
            label: String((x as StrategyGoalDraftQuickAction)?.label ?? '').trim(),
            sendText: String((x as StrategyGoalDraftQuickAction)?.sendText ?? '').trim(),
          }))
          .filter((x) => x.label && x.sendText)
          .slice(0, 12)
      : [];
    return {
      hasSession: true,
      orchestrated: sess.orchestrated,
      pendingDistributionConfirm: Boolean(sess.pendingDistributionConfirm),
      planId: typeof sess.planId === 'string' && sess.planId.trim() ? sess.planId.trim() : null,
      mainGoalTaskId: typeof sess.mainGoalTaskId === 'string' && sess.mainGoalTaskId.trim() ? sess.mainGoalTaskId.trim() : null,
      updatedAt: typeof sess.updatedAt === 'string' && sess.updatedAt.trim() ? sess.updatedAt.trim() : null,
      traceId: typeof sess.traceId === 'string' && sess.traceId.trim() ? sess.traceId.trim() : null,
      sourceStrategyMessageId:
        typeof sess.sourceStrategyMessageId === 'string' && sess.sourceStrategyMessageId.trim()
          ? sess.sourceStrategyMessageId.trim()
          : null,
      planning2026: sess.planning2026,
      legacyPlanning: sess.legacyPlanning,
      distributionPreview,
      strategyGoalDraftQuickActions: qa.length ? qa : null,
    };
  }

  async patchStrategyGoal(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    actorUserId: string;
    strategyGoal: string;
    strategicPhases: Array<{ phaseId?: string; title: string; outcome: string; deadline?: string }>;
  }): Promise<{ planning2026: Planning2026Shape; legacyPlanning: PlanningResult }> {
    await this.assertMainRoomHuman(params.companyId, params.roomId, params.actorUserId);
    const sess = await this.readSession(params.companyId, params.roomId, params.threadId);
    if (!sess) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '当前没有可编辑的战略目标草稿（可能已过期或尚未生成）',
      });
    }
    if (sess.orchestrated) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '已定稿并进入编排，无法再编辑战略目标；如需调整请发起新一轮对话',
      });
    }
    const goal = String(params.strategyGoal ?? '').trim().slice(0, 8000);
    if (!goal) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '主目标不能为空' });
    }
    const phasesIn = (Array.isArray(params.strategicPhases) ? params.strategicPhases : [])
      .map((ph, i) => ({
        phaseId: String(ph?.phaseId ?? '').trim().slice(0, 40) || `p${i + 1}`,
        title: String(ph?.title ?? '').trim().slice(0, 200) || `阶段 ${i + 1}`,
        outcome: String(ph?.outcome ?? '').trim().slice(0, 4000),
        deadline: ph?.deadline ? String(ph.deadline).trim().slice(0, 64) : undefined,
      }))
      .filter((ph) => ph.outcome.length > 0)
      .slice(0, 12);
    if (phasesIn.length === 0) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '至少保留一条阶段性成果 outcome' });
    }
    const nowIso = new Date().toISOString();
    const deadlineFallback = sess.legacyPlanning.timeline?.targetEndAt ?? nowIso;
    const phasesLegacy = phasesIn.map((ph) => ({
      phaseId: ph.phaseId,
      title: ph.title,
      outcome: ph.outcome,
      deadline: ph.deadline && ph.deadline.length > 4 ? ph.deadline : deadlineFallback,
    }));
    const nextPlanning: Planning2026Shape = {
      ...sess.planning2026,
      strategyGoal: goal,
      strategicPhases: phasesIn,
      planDigest: sess.planning2026.planDigest
        ? {
            ...sess.planning2026.planDigest,
            goal: goal.slice(0, 800),
            strategicPhaseCount: phasesIn.length,
          }
        : {
            goal: goal.slice(0, 800),
            topRiskLevel: sess.planning2026.planDigest?.topRiskLevel ?? null,
            strategicPhaseCount: phasesIn.length,
            constraintCount: sess.planning2026.planDigest?.constraintCount ?? 0,
          },
    };
    const nextLegacy: PlanningResult = {
      ...sess.legacyPlanning,
      schemaVersion: '2.1',
      goal,
      strategicPhases: phasesLegacy,
    };
    const next: GoalSessionPayload = {
      ...sess,
      version: 2,
      planning2026: nextPlanning,
      legacyPlanning: nextLegacy,
      updatedAt: nowIso,
    };
    await this.writeSession(params.companyId, params.roomId, params.threadId, next);
    void this.realtime
      .publishEnvelope({
        companyId: params.companyId,
        roomId: params.roomId,
        event: 'main_room_draft:updated',
        kind: 'strategy_goal',
        updatedAt: next.updatedAt,
        traceId: next.traceId,
      })
      .catch(() => undefined);
    return { planning2026: nextPlanning, legacyPlanning: nextLegacy };
  }

  async patchDistributionRows(params: {
    companyId: string;
    roomId: string;
    threadId?: string | null;
    actorUserId: string;
    rows: Array<{ department: string; priority: string; deliverable: string }>;
  }): Promise<{ tasksPatched: number }> {
    await this.assertMainRoomHuman(params.companyId, params.roomId, params.actorUserId);
    const sess = await this.readSession(params.companyId, params.roomId, params.threadId);
    if (!sess?.pendingDistributionConfirm || !sess.pendingDistributionLegacy) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '当前没有待确认的部门分工草稿，无法编辑',
      });
    }
    const plan = sess.pendingDistributionLegacy;
    const tasks = Array.isArray(plan.tasks) ? [...plan.tasks] : [];
    if (!tasks.length) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: '分工计划为空' });
    }
    const rows = Array.isArray(params.rows) ? params.rows.slice(0, 24) : [];
    if (rows.length !== tasks.length) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `行数须与当前分工一致（${tasks.length} 行），请完整提交表格`,
      });
    }
    for (let i = 0; i < tasks.length; i += 1) {
      const r = rows[i]!;
      tasks[i] = {
        ...tasks[i]!,
        department: String(r?.department ?? tasks[i]!.department).trim().slice(0, 128) || tasks[i]!.department,
        priority: normalizePriority(String(r?.priority ?? tasks[i]!.priority)),
        deliverable: String(r?.deliverable ?? '').trim().slice(0, 2000) || tasks[i]!.deliverable,
      };
    }
    const nextDist: DistributionPlan = { ...plan, tasks };
    const next: GoalSessionPayload = {
      ...sess,
      pendingDistributionLegacy: nextDist,
      updatedAt: new Date().toISOString(),
    };
    await this.writeSession(params.companyId, params.roomId, params.threadId, next);
    void this.realtime
      .publishEnvelope({
        companyId: params.companyId,
        roomId: params.roomId,
        event: 'main_room_draft:updated',
        kind: 'distribution',
        updatedAt: next.updatedAt,
        traceId: next.traceId,
      })
      .catch(() => undefined);
    return { tasksPatched: tasks.length };
  }
}
