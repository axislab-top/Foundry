import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

export interface CreateApprovalInput {
  actionType: string;
  riskLevel?: string;
  context?: Record<string, unknown> | null;
  createdBy?: string | null;
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
  ) {}

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

  async findOne(companyId: string, id: string): Promise<ApprovalRequest | null> {
    return this.reqRepo.findOne({ where: { companyId, id } });
  }

  async approve(params: {
    companyId: string;
    approvalId: string;
    actorId: string;
    action: string;
    ttlMinutes?: number;
  }): Promise<{ approval: ApprovalRequest; executionToken: string; expiresAt: Date }> {
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

    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);
    const tokenRow = this.tokenRepo.create({
      companyId: params.companyId,
      approvalRequestId: req.id,
      action: params.action,
      expiresAt,
      consumedAt: null,
    });
    const savedToken = await this.tokenRepo.save(tokenRow);

    await this.appendAudit(req.id, params.companyId, 'approved', { tokenId: savedToken.id }, params.actorId);

    await this.temporalBridge.signalDecision(req.temporalWorkflowId, 'approved');

    const ttlSec = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    await this.redisMirror.setMirror(savedToken.id, {
      companyId: params.companyId,
      approvalRequestId: req.id,
      action: params.action,
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

    return { approval: req, executionToken: savedToken.id, expiresAt };
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
    tokenId: string;
    action: string;
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

      await this.redisMirror.assertMirrorMatchesOrAbsent(params.tokenId, params.companyId, params.action);

      const res = await this.tokenRepo
        .createQueryBuilder()
        .update(ApprovalExecutionToken)
        .set({ consumedAt: () => 'CURRENT_TIMESTAMP' })
        .where('id = :id', { id: params.tokenId })
        .andWhere('company_id = :companyId', { companyId: params.companyId })
        .andWhere('action = :action', { action: params.action })
        .andWhere('consumed_at IS NULL')
        .andWhere('expires_at > NOW()')
        .execute();

      if (!res.affected || res.affected < 1) {
        throw Object.assign(new Error('invalid or expired execution token'), { status: 403 });
      }

      const row = await this.tokenRepo.findOne({
        where: { id: params.tokenId, companyId: params.companyId },
      });
      if (!row) {
        throw Object.assign(new Error('token row missing after consume'), { status: 500 });
      }

      await this.appendAudit(
        row.approvalRequestId,
        params.companyId,
        'token_consumed',
        { tokenId: params.tokenId, action: params.action },
        null,
      );

      await this.redisMirror.onConsumed(params.tokenId);

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
    tokenId: string;
    patch: Record<string, unknown>;
  }): Promise<{ ok: true; appliedKeys: string[] }> {
    await this.consumeExecutionToken({
      companyId: params.companyId,
      tokenId: params.tokenId,
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
