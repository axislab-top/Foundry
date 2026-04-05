import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import {
  TaskRun,
  type TaskRunStatus,
  type TaskRunTriggerSource,
} from '../entities/task-run.entity.js';

interface Actor {
  id: string;
  roles?: string[];
}

export interface StartTaskRunInput {
  triggerSource: TaskRunTriggerSource;
  temporalWorkflowId?: string | null;
  temporalRunId?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class TaskRunService {
  constructor(
    @InjectRepository(TaskRun) private readonly runsRepo: Repository<TaskRun>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
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
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅 Owner/Admin 或系统 actor 可管理任务运行记录',
      });
    }
  }

  serializeRun(row: TaskRun): Record<string, unknown> {
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
      metadata: row.metadata ?? null,
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
    });
    const saved = await this.runsRepo.save(row);
    return this.serializeRun(saved);
  }

  async completeRun(
    runId: string,
    actor: Actor,
    opts?: { costEstimate?: string | null },
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
    const saved = await this.runsRepo.save(row);
    return this.serializeRun(saved);
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
    return this.serializeRun(saved);
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

  private async assertMember(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (actor.roles?.includes('admin')) return;
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
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
    return {
      items: rows.map((r) => this.serializeRun(r)),
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
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
