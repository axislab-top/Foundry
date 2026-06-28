import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  TenantContextService,
  SQL_SET_LOCAL_CURRENT_TENANT,
  SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER,
} from '@service/tenant';
import { MessagingService } from '@service/messaging';
import type { TaskRunFailedEvent } from '@contracts/events';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { Task } from '../entities/task.entity.js';
import {
  TaskRun,
  type TaskRunStatus,
  type TaskRunTriggerSource,
} from '../entities/task-run.entity.js';
import { TaskExecutionLog } from '../entities/task-execution-log.entity.js';

interface Actor {
  id: string;
  roles?: string[];
}

type RiskLevel = 'L1' | 'L2' | 'L3';

export interface StartTaskRunInput {
  triggerSource: TaskRunTriggerSource;
  temporalWorkflowId?: string | null;
  temporalRunId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** M4：可选，关联审批上下文 */
  approvalRequestId?: string | null;
}

@Injectable()
export class TaskRunService {
  constructor(
    @InjectRepository(TaskRun) private readonly runsRepo: Repository<TaskRun>,
    @InjectRepository(TaskExecutionLog)
    private readonly execLogsRepo: Repository<TaskExecutionLog>,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
    private readonly messaging: MessagingService,
    private readonly collabRealtime: CollaborationRealtimePublisher,
  ) {}

  private getCompanyIdOrThrow(): string {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    return companyId;
  }

  private async assertAdmin(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (actor.roles?.includes('admin')) return;
    const membership = await this.membershipsRepo.manager.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);
      return manager.getRepository(CompanyMembership).findOne({
        where: { companyId, userId: actor.id, isActive: true } as any,
      } as any);
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅 Owner/Admin 或系统 actor 可管理任务运行记录',
      });
    }
  }

  private computeRunRisk(row: TaskRun): { riskLevel: RiskLevel; riskScore: number; riskReasons: string[] } {
    const reasons: string[] = [];
    let score = 25;

    if (row.status === 'failed') {
      score += 45;
      reasons.push('run_failed');
    } else if (row.status === 'running') {
      score += 18;
      reasons.push('run_in_progress');
    }

    if (row.errorSummary && row.errorSummary.trim()) {
      score += 20;
      reasons.push('error_summary_present');
    }

    const md = (row.metadata ?? {}) as Record<string, unknown>;
    const approvalRisk = typeof md.approvalRiskLevel === 'string' ? md.approvalRiskLevel : null;
    if (approvalRisk === 'L3') {
      score += 18;
      reasons.push('approval_risk_L3');
    } else if (approvalRisk === 'L2') {
      score += 10;
      reasons.push('approval_risk_L2');
    }

    if (row.approvalRequestId) {
      score += 6;
      reasons.push('approval_required');
    }

    const riskScore = Math.max(0, Math.min(100, score));
    const riskLevel: RiskLevel = riskScore >= 75 ? 'L3' : riskScore >= 45 ? 'L2' : 'L1';
    return { riskLevel, riskScore, riskReasons: reasons };
  }

  serializeRun(row: TaskRun): Record<string, unknown> {
    const risk = this.computeRunRisk(row);
    return {
      id: row.id,
      companyId: row.companyId,
      triggerSource: row.triggerSource,
      temporalWorkflowId: row.temporalWorkflowId ?? null,
      temporalRunId: row.temporalRunId ?? null,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      errorSummary: row.errorSummary ?? null,
      costEstimate: row.costEstimate ?? null,
      actualCost: row.actualCost ?? null,
      metadata: row.metadata ?? null,
      approvalRequestId: row.approvalRequestId ?? null,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      riskReasons: risk.riskReasons,
    };
  }

  async startRun(input: StartTaskRunInput, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertAdmin(companyId, actor);
    const row = this.runsRepo.create({
      companyId,
      triggerSource: input.triggerSource,
      temporalWorkflowId: input.temporalWorkflowId ?? null,
      temporalRunId: input.temporalRunId ?? null,
      status: 'running',
      metadata: input.metadata ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
    });
    const saved = await this.runsRepo.save(row);
    const out = this.serializeRun(saved);
    void this.collabRealtime.publishEnvelope({
      event: 'run:updated',
      companyId,
      payload: { run: out },
    });
    return out;
  }

  async completeRun(
    runId: string,
    actor: Actor,
    opts?: { costEstimate?: string | null; actualCost?: string | null },
  ) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertAdmin(companyId, actor);
    const row = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '运行记录不存在' });
    }
    if (row.status !== 'running') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `运行已结束: ${row.status}`,
      });
    }
    row.status = 'succeeded';
    row.finishedAt = new Date();
    if (opts?.costEstimate !== undefined) {
      row.costEstimate = opts.costEstimate;
    }
    if (opts?.actualCost !== undefined) {
      row.actualCost = opts.actualCost;
    }
    const saved = await this.runsRepo.save(row);
    const out = this.serializeRun(saved);
    void this.collabRealtime.publishEnvelope({
      event: 'run:updated',
      companyId,
      payload: { run: out },
    });
    void this.collabRealtime.publishEnvelope({
      event: 'run:succeeded',
      companyId,
      payload: { run: out },
    });
    return out;
  }

  async failRun(runId: string, actor: Actor, errorSummary: string) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertAdmin(companyId, actor);
    const row = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '运行记录不存在' });
    }
    if (row.status !== 'running') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `运行已结束: ${row.status}`,
      });
    }
    row.status = 'failed';
    row.finishedAt = new Date();
    row.errorSummary = errorSummary.slice(0, 8000);
    const saved = await this.runsRepo.save(row);
    const out = this.serializeRun(saved);
    void this.collabRealtime.publishEnvelope({
      event: 'run:updated',
      companyId,
      payload: { run: out },
    });
    void this.collabRealtime.publishEnvelope({
      event: 'run:failed',
      companyId,
      payload: { run: out },
    });
    const taskRow = await this.execLogsRepo.findOne({
      where: { companyId, runId: saved.id },
      select: ['taskId'],
      order: { createdAt: 'DESC' },
    });
    const taskId = taskRow?.taskId ?? undefined;
    const evt: TaskRunFailedEvent = {
      eventId: randomUUID(),
      eventType: 'task.run.failed',
      aggregateId: saved.id,
      aggregateType: 'task_run',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        runId: saved.id,
        companyId,
        errorSummary: saved.errorSummary ?? '',
        failedAt: saved.finishedAt?.toISOString() ?? new Date().toISOString(),
        ...(taskId ? { taskId } : {}),
      },
    };
    try {
      await this.messaging.publish(evt, {
        routingKey: 'task.run.failed',
        persistent: true,
      });
    } catch {
      // 告警旁路失败不影响主流程
    }
    return out;
  }

  async getRun(runId: string, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const row = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '运行记录不存在' });
    }
    return this.serializeRun(row);
  }

  async interveneRun(
    runId: string,
    actor: Actor,
    input: {
      action: 'pause' | 'force_degrade_model' | 'human_takeover';
      reason?: string;
      params?: Record<string, unknown> | null;
    },
  ) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertAdmin(companyId, actor);
    const row = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '运行记录不存在' });
    }

    const taskRow = await this.execLogsRepo.findOne({
      where: { companyId, runId: row.id },
      order: { createdAt: 'DESC' },
    });
    const taskId = taskRow?.taskId ?? null;
    const task = taskId ? await this.tasksRepo.findOne({ where: { companyId, id: taskId } }) : null;

    const prevMeta = (row.metadata ?? {}) as Record<string, unknown>;
    const interventions = Array.isArray(prevMeta.interventions)
      ? (prevMeta.interventions as Array<Record<string, unknown>>)
      : [];
    const entry = {
      action: input.action,
      actorId: actor.id,
      at: new Date().toISOString(),
      reason: input.reason?.slice(0, 1000) ?? null,
      params: input.params ?? null,
    };
    row.metadata = {
      ...prevMeta,
      interventions: [...interventions, entry],
    };
    const savedRun = await this.runsRepo.save(row);

    if (task) {
      const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
      if (input.action === 'pause' && !['completed', 'cancelled'].includes(task.status)) {
        task.status = 'paused';
        task.blockedReason = input.reason?.slice(0, 1000) ?? 'run_intervention_pause';
      }
      if (input.action === 'human_takeover' && !['completed', 'cancelled'].includes(task.status)) {
        task.requiresHumanApproval = true;
        task.status = 'review';
      }
      if (input.action === 'force_degrade_model') {
        task.metadata = {
          ...taskMeta,
          modelPolicy: {
            ...((taskMeta.modelPolicy as Record<string, unknown> | undefined) ?? {}),
            forceDegraded: true,
            degradeReason: input.reason?.slice(0, 500) ?? 'run_intervention',
          },
        };
      }
      await this.tasksRepo.save(task);
    }

    const out = this.serializeRun(savedRun);
    const roomId =
      task && task.metadata && typeof task.metadata.roomId === 'string' ? task.metadata.roomId : null;
    const payload = {
      run: out,
      runId: savedRun.id,
      taskId,
      action: input.action,
      reason: input.reason ?? null,
      actorId: actor.id,
      at: entry.at,
      roomId,
    };
    void this.collabRealtime.publishEnvelope({
      event: 'run:updated',
      companyId,
      payload: { run: out },
    });
    void this.collabRealtime.publishEnvelope({
      event: 'run:intervention',
      companyId,
      ...(roomId ? { roomId } : {}),
      payload,
    });
    return payload;
  }

  private async assertMember(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (actor.roles?.includes('admin')) return;
    const membership = await this.membershipsRepo.manager.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);
      const memberships = manager.getRepository(CompanyMembership);
      let active = await memberships.findOne({
        where: { companyId, userId: actor.id, isActive: true } as any,
      } as any);
      if (active) return active;

      const company = await manager.getRepository(Company).findOne({
        where: { id: companyId } as any,
        select: ['id', 'createdBy'] as any,
      } as any);
      if (company?.createdBy && String(company.createdBy) === String(actor.id)) {
        const anyRow = await memberships.findOne({
          where: { companyId, userId: actor.id } as any,
          select: ['id', 'companyId', 'userId', 'role', 'isActive'] as any,
        } as any);
        if (anyRow) {
          if (!anyRow.isActive || anyRow.role !== 'owner') {
            await memberships.update(
              { id: anyRow.id } as any,
              { isActive: true, role: 'owner' } as any,
            );
          }
        } else {
          await memberships
            .createQueryBuilder()
            .insert()
            .into(CompanyMembership)
            .values({
              companyId,
              userId: actor.id,
              role: 'owner',
              isActive: true,
            } as any)
            .orIgnore()
            .execute();
        }
        active = await memberships.findOne({
          where: { companyId, userId: actor.id, isActive: true } as any,
        } as any);
        if (active) return active;
      }

      return null;
    });
    if (!membership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '无权访问该公司',
      });
    }
  }

  async listRuns(
    actor: Actor,
    opts?: { limit?: number; page?: number; taskId?: string },
  ) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const limit = Math.min(opts?.limit ?? 30, 100);
    const page = Math.max(opts?.page ?? 1, 1);
    const qb = this.runsRepo
      .createQueryBuilder('r')
      .where('r.company_id = :companyId', { companyId });
    if (opts?.taskId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM task_execution_logs el
          WHERE el.run_id = r.id AND el.company_id = r.company_id AND el.task_id = :filterTaskId
        )`,
        { filterTaskId: opts.taskId },
      );
    }
    qb.orderBy('r.started_at', 'DESC');
    const total = await qb.clone().getCount();
    const rows = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const items = await this.attachRunSummaries(
      companyId,
      rows.map((r) => this.serializeRun(r)),
    );
    return {
      items,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private pickUuidFromMetadata(md: Record<string, unknown>): {
    taskId: string | null;
    agentId: string | null;
  } {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pick = (...vals: unknown[]): string | null => {
      for (const v of vals) {
        if (typeof v !== 'string') continue;
        const s = v.trim();
        if (uuidRe.test(s)) return s;
      }
      return null;
    };
    return {
      taskId: pick(md.taskId, md.task_id, md.triggerRef),
      agentId: pick(md.agentId, md.agent_id),
    };
  }

  /** 为运行列表附加任务/Agent 摘要（日志列、output_snapshot、run.metadata） */
  private async attachRunSummaries(
    companyId: string,
    runs: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (!runs.length) return runs;
    const runIds = runs.map((r) => String(r.id));
    const rows: Array<{
      runId: string;
      taskId: string | null;
      agentId: string | null;
      taskTitle: string | null;
    }> = await this.execLogsRepo.manager.query(
      `SELECT DISTINCT ON (el.run_id)
        el.run_id AS "runId",
        COALESCE(
          el.task_id::text,
          NULLIF(TRIM(el.output_snapshot->>'taskId'), ''),
          NULLIF(TRIM(el.output_snapshot->>'task_id'), ''),
          NULLIF(TRIM(r.metadata->>'taskId'), ''),
          NULLIF(TRIM(r.metadata->>'task_id'), ''),
          NULLIF(TRIM(r.metadata->>'triggerRef'), '')
        ) AS "taskId",
        COALESCE(
          el.agent_id::text,
          NULLIF(TRIM(el.output_snapshot->>'agentId'), ''),
          NULLIF(TRIM(el.output_snapshot->>'agent_id'), ''),
          NULLIF(TRIM(r.metadata->>'agentId'), ''),
          NULLIF(TRIM(r.metadata->>'agent_id'), '')
        ) AS "agentId",
        t.title AS "taskTitle"
      FROM task_execution_logs el
      LEFT JOIN task_runs r ON r.id = el.run_id AND r.company_id = el.company_id
      LEFT JOIN tasks t ON t.company_id = el.company_id AND (
        t.id = el.task_id
        OR t.id::text = NULLIF(TRIM(el.output_snapshot->>'taskId'), '')
        OR t.id::text = NULLIF(TRIM(el.output_snapshot->>'task_id'), '')
        OR t.id::text = NULLIF(TRIM(r.metadata->>'taskId'), '')
        OR t.id::text = NULLIF(TRIM(r.metadata->>'task_id'), '')
        OR t.id::text = NULLIF(TRIM(r.metadata->>'triggerRef'), '')
      )
      WHERE el.company_id = $1 AND el.run_id = ANY($2::uuid[])
      ORDER BY el.run_id, el.created_at DESC`,
      [companyId, runIds],
    );
    const byRun = new Map(rows.map((r) => [r.runId, r]));
    return runs.map((run) => {
      const s = byRun.get(String(run.id));
      const fromMeta = this.pickUuidFromMetadata(
        (run.metadata ?? {}) as Record<string, unknown>,
      );
      return {
        ...run,
        linkedTaskId: s?.taskId ?? fromMeta.taskId ?? null,
        linkedAgentId: s?.agentId ?? fromMeta.agentId ?? null,
        linkedTaskTitle: s?.taskTitle ?? null,
      };
    });
  }

  /** 董事会摘要：最近运行与简单统计 */
  async getBoardRunSummary(actor: Actor, recentLimit = 20) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const recent = await this.runsRepo.find({
      where: { companyId },
      order: { startedAt: 'DESC' },
      take: recentLimit,
    });
    const running = await this.runsRepo.count({ where: { companyId, status: 'running' } });
    const failed24h = await this.runsRepo
      .createQueryBuilder('r')
      .where('r.company_id = :companyId', { companyId })
      .andWhere('r.status = :st', { st: 'failed' as TaskRunStatus })
      .andWhere(`r.finished_at > NOW() - INTERVAL '24 hours'`)
      .getCount();
    return {
      companyId,
      runningCount: running,
      failedLast24h: failed24h,
      recentRuns: recent.map((r) => this.serializeRun(r)),
      generatedAt: new Date().toISOString(),
    };
  }
}
