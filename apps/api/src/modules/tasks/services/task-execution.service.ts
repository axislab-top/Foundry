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
import { AppendExecutionLogDto } from '../dto/append-execution-log.dto.js';
import { TaskExecutionLog } from '../entities/task-execution-log.entity.js';
import { Task } from '../entities/task.entity.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class TaskExecutionService {
  constructor(
    @InjectRepository(TaskExecutionLog)
    private readonly logsRepo: Repository<TaskExecutionLog>,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
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
        message: '无权访问该公司任务',
      });
    }
  }

  async appendLog(taskId: string, dto: AppendExecutionLogDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    const row = this.logsRepo.create({
      companyId,
      taskId,
      agentId: dto.agentId ?? null,
      stepType: dto.stepType,
      message: dto.message ?? null,
      outputSnapshot: dto.outputSnapshot ?? null,
      billingUnits: dto.billingUnits ?? null,
      durationMs: dto.durationMs ?? null,
      traceId: dto.traceId ?? null,
      runId: dto.runId ?? null,
    });
    const saved = await this.logsRepo.save(row);
    return {
      id: saved.id,
      taskId: saved.taskId,
      stepType: saved.stepType,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async listExecutionLogs(
    taskId: string,
    actor: Actor,
    limit = 50,
    runId?: string | null,
  ) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    const where: Record<string, unknown> = { taskId, companyId };
    if (runId) {
      where.runId = runId;
    }
    const items = await this.logsRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
    return {
      taskId,
      runId: runId ?? null,
      items: items.map((l) => ({
        id: l.id,
        agentId: l.agentId,
        stepType: l.stepType,
        message: l.message,
        outputSnapshot: l.outputSnapshot,
        billingUnits: l.billingUnits,
        durationMs: l.durationMs,
        traceId: l.traceId,
        runId: l.runId,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  private serializeLogRow(l: TaskExecutionLog) {
    return {
      id: l.id,
      agentId: l.agentId,
      stepType: l.stepType,
      message: l.message,
      outputSnapshot: l.outputSnapshot,
      billingUnits: l.billingUnits,
      durationMs: l.durationMs,
      traceId: l.traceId,
      runId: l.runId,
      createdAt: l.createdAt.toISOString(),
    };
  }

  /**
   * 董事会视图：同一任务下按 runId 分组（无 run 的日志归在 runId=null 组），组按最近活动时间倒序。
   */
  async listExecutionLogsGroupedByRun(
    taskId: string,
    actor: Actor,
    limit = 200,
  ) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const task = await this.tasksRepo.findOne({ where: { id: taskId, companyId } });
    if (!task) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
    }
    const cap = Math.min(Math.max(limit, 1), 500);
    const items = await this.logsRepo.find({
      where: { taskId, companyId },
      order: { createdAt: 'DESC' },
      take: cap,
    });
    const NO_RUN = '__no_run__';
    const buckets = new Map<string, TaskExecutionLog[]>();
    for (const l of items) {
      const key = l.runId ?? NO_RUN;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(l);
    }
    const groups = Array.from(buckets.entries()).map(([key, logs]) => {
      const sorted = [...logs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const latest = sorted[sorted.length - 1];
      return {
        runId: key === NO_RUN ? null : key,
        latestAt: latest.createdAt.toISOString(),
        items: sorted.map((row) => this.serializeLogRow(row)),
      };
    });
    groups.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
    return { taskId, groups };
  }
}
