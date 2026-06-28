import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import type { ApprovalDomainStatus, ApprovalStatusChangedEvent } from '@contracts/events';
import { Company } from '../../companies/entities/company.entity.js';
import { CollaborationApprovalNotifier } from '../../collaboration/services/collaboration-approval-notifier.service.js';
import { ApprovalAuditLog } from '../entities/approval-audit-log.entity.js';
import { ApprovalExecutionToken } from '../entities/approval-execution-token.entity.js';
import { ApprovalRequest } from '../entities/approval-request.entity.js';
import { ApprovalRedisMirrorService } from './approval-redis-mirror.service.js';
import { ApprovalTemporalBridgeService } from './approval-temporal-bridge.service.js';
import { ApprovalMetricsService } from './approval-metrics.service.js';
import { CompanyRuntimePreferenceService } from '../../companies/services/company-runtime-preference.service.js';

export interface CreateApprovalInput {
  actionType: string;
  riskLevel?: string;
  context?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export type ApprovalListScope = 'pending' | 'resolved_mine' | 'company_all';

export interface ApprovalListParams {
  companyId: string;
  actorId: string;
  scope: ApprovalListScope;
  limit?: number;
  cursor?: string | null;
  /** 逗号分隔：pending,approved,rejected,expired,cancelled */
  statusCsv?: string | null;
  riskLevel?: string | null;
  /** 高风险=L3，中风险=L2（与前端筛选对齐） */
  riskBand?: 'all' | 'high' | 'medium' | null;
  actionTypePrefix?: string | null;
  /** 逗号分隔前缀；支持特殊值 __other__ 表示“非内置类型” */
  actionTypeCsv?: string | null;
  q?: string | null;
  createdAfter?: string | null;
  createdBefore?: string | null;
  resolvedAfter?: string | null;
  resolvedBefore?: string | null;
}

export interface ApprovalListResult {
  items: ApprovalRequest[];
  nextCursor: string | null;
}

export interface ApprovalWeeklyStats {
  pendingCount: number;
  /** 本周（UTC 周一 00:00 起）已决件数 */
  resolvedThisWeekCount: number;
  approvedThisWeekCount: number;
  rejectedThisWeekCount: number;
  /** 通过 / (通过+拒绝)，不含过期 */
  approvalRateThisWeek: number | null;
  /** 毫秒，仅统计有 resolved_at 的本周项 */
  avgResolutionMsThisWeek: number | null;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    @InjectRepository(ApprovalRequest) private readonly reqRepo: Repository<ApprovalRequest>,
    @InjectRepository(ApprovalAuditLog) private readonly auditRepo: Repository<ApprovalAuditLog>,
    @InjectRepository(ApprovalExecutionToken) private readonly tokenRepo: Repository<ApprovalExecutionToken>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly temporalBridge: ApprovalTemporalBridgeService,
    private readonly redisMirror: ApprovalRedisMirrorService,
    private readonly messaging: MessagingService,
    private readonly collaborationNotifier: CollaborationApprovalNotifier,
    private readonly metrics: ApprovalMetricsService,
    private readonly companyRuntimePreference: CompanyRuntimePreferenceService,
  ) {}

  /**
   * P12：在 **已人工批准** 且 `actionType === runner.exec` 的 `ApprovalRequest` 背书下，
   * 签发 **5 分钟**有效、绑定 `skillSlug` 的一次性执行令牌（`used=false`，消费后 PG+Redis 标记已用）。
   */
  async createExecutionToken(params: {
    companyId: string;
    actorId: string;
    approvalRequestId: string;
    skillSlug: string;
    context?: Record<string, unknown> | null;
  }): Promise<{ executionTokenId: string; expiresAt: Date; approvalRequestId: string }> {
    const RUNNER_EXEC = 'runner.exec';
    const slug = params.skillSlug.trim();
    if (!slug) {
      throw Object.assign(new Error('skillSlug required'), { status: 400 });
    }

    const tenantRow = await this.companyRepo.findOne({
      where: { id: params.companyId },
      select: ['id', 'executionPaused'],
    });
    if (tenantRow?.executionPaused) {
      throw Object.assign(new Error('company execution is paused'), { status: 423 });
    }

    const req = await this.reqRepo.findOne({
      where: { id: params.approvalRequestId, companyId: params.companyId },
    });
    if (!req) {
      throw Object.assign(new Error('approval request not found'), { status: 404 });
    }
    if (req.status !== 'approved') {
      throw Object.assign(new Error(`approval not approved: ${req.status}`), { status: 403 });
    }
    if (req.actionType !== RUNNER_EXEC) {
      throw Object.assign(
        new Error(`approval actionType must be ${RUNNER_EXEC}, got ${req.actionType}`),
        { status: 403 },
      );
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const tokenRow = this.tokenRepo.create({
      companyId: params.companyId,
      approvalRequestId: req.id,
      action: RUNNER_EXEC,
      skillSlug: slug,
      expiresAt,
      consumedAt: null,
    });
    const savedToken = await this.tokenRepo.save(tokenRow);

    await this.appendAudit(
      req.id,
      params.companyId,
      'execution_token_minted',
      {
        executionTokenId: savedToken.id,
        skillSlug: slug,
        expiresAt: expiresAt.toISOString(),
        ...(params.context ?? {}),
      },
      params.actorId,
    );

    const ttlSec = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    await this.redisMirror.setMirror(savedToken.id, {
      executionTokenId: savedToken.id,
      companyId: params.companyId,
      approvalRequestId: req.id,
      action: RUNNER_EXEC,
      skillSlug: slug,
      used: false,
      expiresAtIso: expiresAt.toISOString(),
    }, ttlSec);

    return {
      executionTokenId: savedToken.id,
      expiresAt,
      approvalRequestId: req.id,
    };
  }

  async create(companyId: string, input: CreateApprovalInput): Promise<ApprovalRequest> {
    const row = this.reqRepo.create({
      companyId,
      status: 'pending',
      riskLevel: input.riskLevel ?? 'L2',
      actionType: input.actionType,
      context: input.context ?? null,
      createdBy: input.createdBy ?? null,
      temporalWorkflowId: null,
    });
    const saved = await this.reqRepo.save(row);
    await this.appendAudit(saved.id, companyId, 'created', { actionType: input.actionType }, input.createdBy);
    const wfId = await this.temporalBridge.startApprovalWaitWorkflow({
      approvalId: saved.id,
      companyId,
    });
    if (wfId) {
      saved.temporalWorkflowId = wfId;
      await this.reqRepo.save(saved);
    }
    await this.broadcastApprovalDigest({
      companyId,
      approvalRequestId: saved.id,
      status: 'pending',
      executionTokenId: null,
      actionType: saved.actionType,
      roomId: this.roomIdFromApprovalContext(saved.context),
    });
    return saved;
  }

  async listPending(companyId: string, limit = 50): Promise<ApprovalRequest[]> {
    return this.reqRepo.find({
      where: { companyId, status: 'pending' },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  /**
   * 分页列表：scope=pending | resolved_mine | company_all；cursor 为 opaque（createdAt+id）。
   */
  async listFiltered(params: ApprovalListParams): Promise<ApprovalListResult> {
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const qb = this.reqRepo
      .createQueryBuilder('req')
      .where('req.companyId = :companyId', { companyId: params.companyId });

    if (params.scope === 'pending') {
      qb.andWhere('req.status = :st', { st: 'pending' });
    } else if (params.scope === 'resolved_mine') {
      qb.andWhere('req.resolvedBy = :rb', { rb: params.actorId }).andWhere('req.status IN (:...term)', {
        term: ['approved', 'rejected', 'expired'],
      });
    } else {
      // company_all
      const statuses = this.parseStatusCsv(params.statusCsv);
      if (statuses?.length) {
        qb.andWhere('req.status IN (:...sts)', { sts: statuses });
      }
    }

    if (params.riskBand === 'high') {
      qb.andWhere('req.riskLevel = :rl', { rl: 'L3' });
    } else if (params.riskBand === 'medium') {
      qb.andWhere('req.riskLevel = :rl2', { rl2: 'L2' });
    } else if (params.riskLevel?.trim()) {
      qb.andWhere('req.riskLevel = :rl3', { rl3: params.riskLevel.trim() });
    }

    const prefix = params.actionTypePrefix?.trim();
    if (prefix) {
      qb.andWhere('req.actionType LIKE :pfx', { pfx: `${prefix}%` });
    }
    const actionTypeRoots = this.parseActionTypeCsv(params.actionTypeCsv);
    if (actionTypeRoots?.length) {
      const wantsOther = actionTypeRoots.includes('__other__');
      const roots = actionTypeRoots.filter((x) => x !== '__other__');
      if (roots.length) {
        qb.andWhere(
          new Brackets((w) => {
            roots.forEach((r, idx) => {
              const k = `at${idx}`;
              if (idx === 0) w.where(`req.actionType ILIKE :${k}`, { [k]: `${r}%` });
              else w.orWhere(`req.actionType ILIKE :${k}`, { [k]: `${r}%` });
            });
          }),
        );
      }
      if (wantsOther) {
        const builtins = [
          'billing',
          'budget',
          'org',
          'organization',
          'department',
          'agent',
          'supervisor',
          'skill',
          'tool',
          'webhook',
          'integration',
          'external',
          'company',
        ];
        builtins.forEach((r, idx) => {
          qb.andWhere(`req.actionType NOT ILIKE :notAt${idx}`, { [`notAt${idx}`]: `${r}%` });
        });
      }
    }

    const q = params.q?.trim();
    if (q) {
      const safe = q.replace(/[%_\\]/g, '');
      if (safe.length) {
        const like = `%${safe}%`;
        qb.andWhere(
          new Brackets((w) => {
            w.where("COALESCE(req.context->>'title', '') ILIKE :like", { like })
              .orWhere("COALESCE(req.context->>'summary', '') ILIKE :like", { like })
              .orWhere('req.actionType ILIKE :like', { like });
          }),
        );
      }
    }

    const ca = params.createdAfter ? new Date(params.createdAfter) : null;
    const cb = params.createdBefore ? new Date(params.createdBefore) : null;
    if (ca && !Number.isNaN(ca.getTime())) {
      qb.andWhere('req.createdAt >= :ca', { ca });
    }
    if (cb && !Number.isNaN(cb.getTime())) {
      qb.andWhere('req.createdAt <= :cb', { cb });
    }
    const ra = params.resolvedAfter ? new Date(params.resolvedAfter) : null;
    const rb = params.resolvedBefore ? new Date(params.resolvedBefore) : null;
    if (ra && !Number.isNaN(ra.getTime())) {
      qb.andWhere('req.resolvedAt >= :ra', { ra });
    }
    if (rb && !Number.isNaN(rb.getTime())) {
      qb.andWhere('req.resolvedAt <= :rb2', { rb2: rb });
    }

    const cur = this.decodeListCursor(params.cursor);
    if (cur) {
      qb.andWhere(
        '(req.createdAt < :cAt OR (req.createdAt = :cAtEq AND req.id < :cId))',
        { cAt: cur.createdAt, cAtEq: cur.createdAt, cId: cur.id },
      );
    }

    qb.orderBy('req.createdAt', 'DESC').addOrderBy('req.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!;
      nextCursor = this.encodeListCursor(last.createdAt, last.id);
    }

    return { items, nextCursor };
  }

  async weeklyStats(companyId: string): Promise<ApprovalWeeklyStats> {
    const pendingCount = await this.reqRepo.count({ where: { companyId, status: 'pending' } });

    const weekStart = this.startOfWeekUtc(new Date());
    const qb = this.reqRepo
      .createQueryBuilder('req')
      .where('req.companyId = :companyId', { companyId })
      .andWhere('req.resolvedAt IS NOT NULL')
      .andWhere('req.resolvedAt >= :ws', { ws: weekStart })
      .andWhere('req.status IN (:...st)', { st: ['approved', 'rejected', 'expired'] });

    const rows = await qb.getMany();
    const resolvedThisWeekCount = rows.length;
    const approvedThisWeekCount = rows.filter((r) => r.status === 'approved').length;
    const rejectedThisWeekCount = rows.filter((r) => r.status === 'rejected').length;
    const terminal = approvedThisWeekCount + rejectedThisWeekCount;
    const approvalRateThisWeek =
      terminal > 0 ? approvedThisWeekCount / terminal : null;

    let avgResolutionMsThisWeek: number | null = null;
    const deltas: number[] = [];
    for (const r of rows) {
      if (r.resolvedAt && r.createdAt) {
        deltas.push(r.resolvedAt.getTime() - r.createdAt.getTime());
      }
    }
    if (deltas.length) {
      avgResolutionMsThisWeek = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    }

    return {
      pendingCount,
      resolvedThisWeekCount,
      approvedThisWeekCount,
      rejectedThisWeekCount,
      approvalRateThisWeek,
      avgResolutionMsThisWeek,
    };
  }

  private startOfWeekUtc(d: Date): Date {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = x.getUTCDay();
    const diff = (day + 6) % 7; // Monday = 0
    x.setUTCDate(x.getUTCDate() - diff);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }

  private parseStatusCsv(csv: string | null | undefined): ApprovalRequest['status'][] | undefined {
    if (!csv?.trim()) return undefined;
    const allowed = new Set(['pending', 'approved', 'rejected', 'expired', 'cancelled']);
    const parts = csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const out = parts.filter((p) => allowed.has(p)) as ApprovalRequest['status'][];
    return out.length ? out : undefined;
  }

  private parseActionTypeCsv(csv: string | null | undefined): string[] | undefined {
    if (!csv?.trim()) return undefined;
    const out = csv
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .filter((s) => /^[a-z0-9_.:-]+$/.test(s) || s === '__other__');
    return out.length ? Array.from(new Set(out)) : undefined;
  }

  private decodeListCursor(
    raw: string | null | undefined,
  ): { createdAt: Date; id: string } | null {
    if (!raw?.trim()) return null;
    try {
      const json = Buffer.from(raw.trim(), 'base64url').toString('utf8');
      const o = JSON.parse(json) as { ca?: string; id?: string };
      if (typeof o.ca !== 'string' || typeof o.id !== 'string') return null;
      const createdAt = new Date(o.ca);
      if (Number.isNaN(createdAt.getTime())) return null;
      return { createdAt, id: o.id };
    } catch {
      return null;
    }
  }

  private encodeListCursor(createdAt: Date, id: string): string {
    const json = JSON.stringify({ ca: createdAt.toISOString(), id });
    return Buffer.from(json, 'utf8').toString('base64url');
  }

  async findOne(companyId: string, id: string): Promise<ApprovalRequest | null> {
    return this.reqRepo.findOne({ where: { companyId, id } });
  }

  async approve(params: {
    companyId: string;
    approvalId: string;
    actorId: string;
    action: string;
    ttlMinutes?: number;
  }): Promise<{ approval: ApprovalRequest; executionTokenId: string; expiresAt: Date }> {
    const ttl = Math.min(Math.max(params.ttlMinutes ?? 15, 5), 120);
    const req = await this.reqRepo.findOne({
      where: { id: params.approvalId, companyId: params.companyId },
    });
    if (!req) {
      throw Object.assign(new Error('approval request not found'), { status: 404 });
    }
    if (req.status !== 'pending') {
      throw Object.assign(new Error(`approval not pending: ${req.status}`), { status: 409 });
    }

    const tenantRow = await this.companyRepo.findOne({
      where: { id: params.companyId },
      select: ['id', 'executionPaused'],
    });
    if (tenantRow?.executionPaused) {
      throw Object.assign(new Error('company execution is paused'), { status: 423 });
    }

    req.status = 'approved';
    req.resolvedBy = params.actorId;
    req.resolvedAt = new Date();
    await this.reqRepo.save(req);

    try {
      await this.companyRuntimePreference.applyFromApprovedRequest(req);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error({
        msg: 'company_runtime_preference_apply_failed_reverting_approval',
        approvalId: req.id,
        companyId: params.companyId,
        error: msg,
      });
      req.status = 'pending';
      req.resolvedBy = null;
      req.resolvedAt = null;
      await this.reqRepo.save(req);
      throw Object.assign(new Error(`runtime_preference_apply_failed: ${msg}`), { status: 500 });
    }

    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);
    const tokenRow = this.tokenRepo.create({
      companyId: params.companyId,
      approvalRequestId: req.id,
      action: params.action,
      skillSlug: null,
      expiresAt,
      consumedAt: null,
    });
    const savedToken = await this.tokenRepo.save(tokenRow);

    await this.appendAudit(req.id, params.companyId, 'approved', { executionTokenId: savedToken.id }, params.actorId);

    await this.temporalBridge.signalDecision(req.temporalWorkflowId, 'approved');

    const ttlSec = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    await this.redisMirror.setMirror(savedToken.id, {
      executionTokenId: savedToken.id,
      companyId: params.companyId,
      approvalRequestId: req.id,
      action: params.action,
      skillSlug: null,
      used: false,
      expiresAtIso: expiresAt.toISOString(),
    }, ttlSec);

    await this.broadcastApprovalDigest({
      companyId: params.companyId,
      approvalRequestId: req.id,
      status: 'approved',
      executionTokenId: savedToken.id,
      resolvedBy: params.actorId,
      actionType: req.actionType,
      roomId: this.roomIdFromApprovalContext(req.context),
    });
    this.metrics.incDecision('approved');

    return { approval: req, executionTokenId: savedToken.id, expiresAt };
  }

  async reject(params: {
    companyId: string;
    approvalId: string;
    actorId: string;
    reason?: string | null;
  }): Promise<ApprovalRequest> {
    const req = await this.reqRepo.findOne({
      where: { id: params.approvalId, companyId: params.companyId },
    });
    if (!req) {
      throw Object.assign(new Error('approval request not found'), { status: 404 });
    }
    if (req.status !== 'pending') {
      throw Object.assign(new Error(`approval not pending: ${req.status}`), { status: 409 });
    }
    req.status = 'rejected';
    req.resolvedBy = params.actorId;
    req.resolvedAt = new Date();
    req.rejectionReason = params.reason ?? null;
    await this.reqRepo.save(req);
    await this.appendAudit(req.id, params.companyId, 'rejected', { reason: params.reason }, params.actorId);
    await this.temporalBridge.signalDecision(req.temporalWorkflowId, 'rejected');
    await this.broadcastApprovalDigest({
      companyId: params.companyId,
      approvalRequestId: req.id,
      status: 'rejected',
      executionTokenId: null,
      resolvedBy: params.actorId,
      reason: params.reason ?? undefined,
      actionType: req.actionType,
      roomId: this.roomIdFromApprovalContext(req.context),
    });
    this.metrics.incDecision('rejected');
    return req;
  }

  /**
   * 原子消费执行令牌：未批准 / 过期 / 租户不匹配 / 已消费 → 拒绝。
   */
  async consumeExecutionToken(params: {
    companyId: string;
    executionTokenId: string;
    action: string;
    skillSlug?: string | null;
  }): Promise<{ ok: true; approvalRequestId: string }> {
    const t0 = Date.now();
    const finish = (outcome: 'ok' | 'deny'): void => {
      this.metrics.observeConsumeSeconds(outcome, (Date.now() - t0) / 1000);
    };
    try {
      const tenantRow = await this.companyRepo.findOne({
        where: { id: params.companyId },
        select: ['id', 'executionPaused'],
      });
      if (tenantRow?.executionPaused) {
        throw Object.assign(new Error('company execution is paused'), { status: 423 });
      }

      await this.redisMirror.assertMirrorMatchesOrAbsent(
        params.executionTokenId,
        params.companyId,
        params.action,
        params.skillSlug ?? undefined,
      );

      const qb = this.tokenRepo
        .createQueryBuilder()
        .update(ApprovalExecutionToken)
        .set({ consumedAt: () => 'CURRENT_TIMESTAMP' })
        .where('id = :id', { id: params.executionTokenId })
        .andWhere('company_id = :companyId', { companyId: params.companyId })
        .andWhere('action = :action', { action: params.action })
        .andWhere('consumed_at IS NULL')
        .andWhere('expires_at > NOW()');

      const sk = params.skillSlug?.trim();
      if (sk) {
        qb.andWhere('skill_slug = :skillSlug', { skillSlug: sk });
      } else {
        qb.andWhere('skill_slug IS NULL');
      }

      const res = await qb.execute();

      if (!res.affected || res.affected < 1) {
        throw Object.assign(new Error('invalid or expired execution token'), { status: 403 });
      }

      const row = await this.tokenRepo.findOne({
        where: { id: params.executionTokenId, companyId: params.companyId },
      });
      if (!row) {
        throw Object.assign(new Error('token row missing after consume'), { status: 500 });
      }

      await this.appendAudit(
        row.approvalRequestId,
        params.companyId,
        'token_consumed',
        { executionTokenId: params.executionTokenId, action: params.action, skillSlug: sk ?? null },
        null,
      );

      await this.redisMirror.onConsumed(params.executionTokenId);

      finish('ok');
      return { ok: true, approvalRequestId: row.approvalRequestId };
    } catch (e) {
      finish('deny');
      throw e;
    }
  }

  /**
   * 竖切 A：平台内「配置变更」样板 — 必须先 consume `action=config.apply` 的执行令牌。
   * 真实写入配置存储在后续迭代接入；此处仅证明闸门不可绕过。
   */
  async applyGatedConfigPatch(params: {
    companyId: string;
    executionTokenId: string;
    patch: Record<string, unknown>;
  }): Promise<{ ok: true; appliedKeys: string[] }> {
    await this.consumeExecutionToken({
      companyId: params.companyId,
      executionTokenId: params.executionTokenId,
      action: 'config.apply',
    });
    return { ok: true, appliedKeys: Object.keys(params.patch ?? {}) };
  }

  /** Temporal activity / internal：超时将 pending 置为 expired */
  async expireIfStillPending(companyId: string, approvalId: string): Promise<boolean> {
    const req = await this.reqRepo.findOne({ where: { id: approvalId, companyId } });
    if (!req || req.status !== 'pending') return false;
    req.status = 'expired';
    await this.reqRepo.save(req);
    await this.appendAudit(approvalId, companyId, 'expired', {}, null);
    await this.broadcastApprovalDigest({
      companyId,
      approvalRequestId: approvalId,
      status: 'expired',
      executionTokenId: null,
      actionType: req.actionType,
      roomId: this.roomIdFromApprovalContext(req.context),
    });
    this.metrics.incDecision('expired');
    return true;
  }

  private roomIdFromApprovalContext(context: Record<string, unknown> | null): string | undefined {
    if (!context || typeof context.roomId !== 'string') return undefined;
    const s = context.roomId.trim();
    return s.length ? s : undefined;
  }

  /** MQ `approval.status.changed` + 协作 WebSocket `approval:status`。 */
  private async broadcastApprovalDigest(params: {
    companyId: string;
    approvalRequestId: string;
    status: ApprovalDomainStatus;
    executionTokenId?: string | null;
    resolvedBy?: string;
    reason?: string;
    actionType?: string | null;
    roomId?: string | null;
  }): Promise<void> {
    const wsStatus =
      params.status === 'approved' ||
      params.status === 'rejected' ||
      params.status === 'expired' ||
      params.status === 'pending'
        ? params.status
        : null;
    const evt: ApprovalStatusChangedEvent = {
      eventId: randomUUID(),
      eventType: 'approval.status.changed',
      aggregateId: params.approvalRequestId,
      aggregateType: 'approval',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: params.companyId,
      data: {
        companyId: params.companyId,
        approvalRequestId: params.approvalRequestId,
        status: params.status,
        executionTokenId: params.executionTokenId ?? null,
        resolvedBy: params.resolvedBy,
        reason: params.reason,
        actionType: params.actionType ?? null,
      },
    };
    try {
      await this.messaging.publish(evt, {
        routingKey: 'approval.status.changed',
        persistent: true,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`publish approval.status.changed failed: ${msg}`);
    }

    if (wsStatus) {
      try {
        await this.collaborationNotifier.pushApprovalStatus({
          companyId: params.companyId,
          roomId: params.roomId ?? undefined,
          approvalRequestId: params.approvalRequestId,
          status: wsStatus,
          executionTokenId: params.executionTokenId ?? null,
          resolvedBy: params.resolvedBy,
          reason: params.reason,
          actionType: params.actionType ?? null,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`push approval:status failed: ${msg}`);
      }
    }
  }

  private async appendAudit(
    approvalRequestId: string,
    companyId: string,
    eventType: string,
    payload: Record<string, unknown>,
    actorId: string | null,
  ): Promise<void> {
    const row = this.auditRepo.create({
      approvalRequestId,
      companyId,
      eventType,
      payload: Object.keys(payload).length ? payload : null,
      actorId,
    });
    await this.auditRepo.save(row);
  }
}
