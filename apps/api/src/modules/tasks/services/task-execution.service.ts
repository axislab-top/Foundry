import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TenantContextService,
  SQL_SET_LOCAL_CURRENT_TENANT,
  SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER,
} from '@service/tenant';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { AppendExecutionLogDto } from '../dto/append-execution-log.dto.js';
import { ClickhouseTraceService } from '../../observability/clickhouse-trace.service.js';
import { CollaborationRealtimePublisher } from '../../collaboration/services/collaboration-realtime-publisher.service.js';
import { TaskExecutionLog } from '../entities/task-execution-log.entity.js';
import { TaskRun } from '../entities/task-run.entity.js';
import { Task } from '../entities/task.entity.js';

interface Actor {
  id: string;
  roles?: string[];
}

function redactString(raw: string): string {
  let s = raw;
  s = s.replace(/sk-[A-Za-z0-9]{8,}/g, 'sk-[REDACTED]');
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  s = s.replace(
    /(api[_-]?key|authorization|token|password|secret)\s*[:=]\s*["']?[^"'\\s,}]+/gi,
    '$1:[REDACTED]',
  );
  return s;
}

function redactAny(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return redactString(v);
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => redactAny(x));
  const rec = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(rec)) {
    if (/(api[_-]?key|authorization|token|password|secret)/i.test(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactAny(val);
    }
  }
  return out;
}

@Injectable()
export class TaskExecutionService {
  constructor(
    @InjectRepository(TaskExecutionLog)
    private readonly logsRepo: Repository<TaskExecutionLog>,
    @InjectRepository(Task) private readonly tasksRepo: Repository<Task>,
    @InjectRepository(TaskRun) private readonly runsRepo: Repository<TaskRun>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
    private readonly clickhouseTrace: ClickhouseTraceService,
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

  private async assertMember(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (actor.roles?.includes('admin')) return;
    const workerActorId = process.env.WORKER_ACTOR_USER_ID;
    if (workerActorId && actor.id === workerActorId) return;

    const membership = await this.membershipsRepo.manager.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);
      const memberships = manager.getRepository(CompanyMembership);
      let active = await memberships.findOne({
        where: { companyId, userId: actor.id, isActive: true },
      });
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
    const spanId = saved.id;
    const parentSpanId =
      saved.runId
        ? (await this.logsRepo.findOne({
            where: { companyId, runId: saved.runId },
            select: ['id'],
            order: { createdAt: 'DESC' },
          }))?.id ?? null
        : null;
    void this.clickhouseTrace.mirrorExecutionLog({
      companyId,
      runId: saved.runId,
      taskId: saved.taskId,
      agentId: saved.agentId,
      traceId: saved.traceId,
      stepType: saved.stepType,
      message: saved.message,
      outputSnapshot: saved.outputSnapshot,
      durationMs: saved.durationMs,
      billingUnits: saved.billingUnits,
      spanId,
      parentSpanId,
      eventType: 'execution_log',
    });
    if (saved.runId) {
      const payload = {
        stepType: saved.stepType,
        message: redactAny(saved.message),
        outputSnapshot: redactAny(saved.outputSnapshot),
        durationMs: saved.durationMs,
        billingUnits: saved.billingUnits,
      };
      const traceEvent = {
        event_time: saved.createdAt.toISOString(),
        company_id: companyId,
        run_id: saved.runId,
        task_id: saved.taskId,
        agent_id: saved.agentId,
        request_id: '',
        trace_id: saved.traceId ?? '',
        span_id: spanId,
        parent_span_id: parentSpanId ?? '',
        event_type: 'execution_log',
        source_service: 'api',
        payload_json: JSON.stringify(payload),
      };
      const envelope = {
        runId: saved.runId,
        spanId,
        parentSpanId,
        traceEvent,
        executionLog: this.serializeLogRow(saved),
      };

      // Backward compatible "append" event.
      void this.collabRealtime.publishEnvelope({
        event: 'run:step.appended',
        companyId,
        payload: envelope,
      });

      // Fine-grained step events (2026 streaming UX).
      const st = String(saved.stepType ?? '');
      const fine =
        st.endsWith('.error') ? 'run:step.failed' : st.endsWith('.complete') ? 'run:step.completed' : st.endsWith('.start') ? 'run:step.started' : null;
      if (fine) {
        void this.collabRealtime.publishEnvelope({
          event: fine,
          companyId,
          payload: envelope,
        });
      }
    }
    return {
      id: saved.id,
      taskId: saved.taskId,
      stepType: saved.stepType,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /**
   * Run-scoped step (e.g. CEO heartbeat) without requiring a task row; optional taskId in dto links a task.
   */
  async appendLogForRun(runId: string, dto: AppendExecutionLogDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const run = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!run) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '运行记录不存在' });
    }
    let linkedTaskId: string | null = null;
    if (dto.taskId) {
      const task = await this.tasksRepo.findOne({ where: { id: dto.taskId, companyId } });
      if (!task) {
        throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '任务不存在' });
      }
      linkedTaskId = task.id;
    }
    const row = this.logsRepo.create({
      companyId,
      taskId: linkedTaskId,
      agentId: dto.agentId ?? null,
      stepType: dto.stepType,
      message: dto.message ?? null,
      outputSnapshot: dto.outputSnapshot ?? null,
      billingUnits: dto.billingUnits ?? null,
      durationMs: dto.durationMs ?? null,
      traceId: dto.traceId ?? null,
      runId,
    });
    const saved = await this.logsRepo.save(row);
    const spanId = saved.id;
    const parentSpanId =
      saved.runId
        ? (await this.logsRepo.findOne({
            where: { companyId, runId: saved.runId },
            select: ['id'],
            order: { createdAt: 'DESC' },
          }))?.id ?? null
        : null;
    void this.clickhouseTrace.mirrorExecutionLog({
      companyId,
      runId: saved.runId,
      taskId: saved.taskId,
      agentId: saved.agentId,
      traceId: saved.traceId,
      stepType: saved.stepType,
      message: saved.message,
      outputSnapshot: saved.outputSnapshot,
      durationMs: saved.durationMs,
      billingUnits: saved.billingUnits,
      spanId,
      parentSpanId,
      eventType: 'execution_log',
    });
    if (saved.runId) {
      const payload = {
        stepType: saved.stepType,
        message: redactAny(saved.message),
        outputSnapshot: redactAny(saved.outputSnapshot),
        durationMs: saved.durationMs,
        billingUnits: saved.billingUnits,
      };
      const traceEvent = {
        event_time: saved.createdAt.toISOString(),
        company_id: companyId,
        run_id: saved.runId,
        task_id: saved.taskId,
        agent_id: saved.agentId,
        request_id: '',
        trace_id: saved.traceId ?? '',
        span_id: spanId,
        parent_span_id: parentSpanId ?? '',
        event_type: 'execution_log',
        source_service: 'api',
        payload_json: JSON.stringify(payload),
      };
      const envelope = {
        runId: saved.runId,
        spanId,
        parentSpanId,
        traceEvent,
        executionLog: this.serializeLogRow(saved),
      };

      void this.collabRealtime.publishEnvelope({
        event: 'run:step.appended',
        companyId,
        payload: envelope,
      });

      const st = String(saved.stepType ?? '');
      const fine =
        st.endsWith('.error') ? 'run:step.failed' : st.endsWith('.complete') ? 'run:step.completed' : st.endsWith('.start') ? 'run:step.started' : null;
      if (fine) {
        void this.collabRealtime.publishEnvelope({
          event: fine,
          companyId,
          payload: envelope,
        });
      }
    }
    return {
      id: saved.id,
      taskId: saved.taskId,
      stepType: saved.stepType,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /** All execution logs for a task run (any task_id, same run_id). */
  async listExecutionLogsByRunId(runId: string, actor: Actor, limit = 200) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const run = await this.runsRepo.findOne({ where: { id: runId, companyId } });
    if (!run) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '运行记录不存在' });
    }
    const cap = Math.min(Math.max(limit, 1), 500);
    const items = await this.logsRepo.find({
      where: { companyId, runId },
      order: { createdAt: 'ASC' },
      take: cap,
    });
    return {
      runId,
      items: items.map((l) => this.serializeLogRow(l)),
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
      items: items.map((l) => this.serializeLogRow(l)),
    };
  }

  private serializeLogRow(l: TaskExecutionLog) {
    return {
      id: l.id,
      taskId: l.taskId,
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
