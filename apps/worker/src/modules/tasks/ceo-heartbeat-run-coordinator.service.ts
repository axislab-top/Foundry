import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AutonomousOrchestratorService, type RunHeartbeatOptions } from '../autonomous/autonomous-orchestrator.service.js';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { CompanyExecutionCoordinationService } from '../../common/coordination/company-execution-coordination.service.js';
import type { HeartbeatCeoGraphTier } from '../company-runtime/heartbeat-escalation-decider.service.js';

export type CeoHeartbeatTriggerSource = 'temporal' | 'nest_timer';

export type TaskRunTriggerSourceForCycle =
  | CeoHeartbeatTriggerSource
  | 'task_completed'
  | 'budget_warning';

export interface CeoHeartbeatRunCoordinatorOptions {
  /** When set, skip tasks.run.start and use this run id (Temporal idempotent replay). */
  existingRunId?: string;
  temporalWorkflowId?: string;
  temporalRunId?: string;
  /** Extra metadata stored on task_runs */
  metadata?: Record<string, unknown>;
  /** 路径 A：平稳期 cheap 跳过 CEO LangGraph；缺省为 full */
  heartbeatTier?: HeartbeatCeoGraphTier;
  heartbeatTierReason?: string;
  /** full graph 成功后写入协调层的状态指纹 */
  heartbeatFingerprint?: string;
}

export interface ExecuteCycleCoreParams {
  companyId: string;
  tickAt: string;
  taskRunTriggerSource: TaskRunTriggerSourceForCycle;
  autonomousTriggerSource: NonNullable<RunHeartbeatOptions['triggerSource']>;
  includeDirectorFanout: boolean;
  triggerRef?: string;
  opts?: CeoHeartbeatRunCoordinatorOptions;
}

type HeartbeatFrequency = 'hourly' | 'daily' | 'weekly';

interface CompanyHeartbeatConfigRpc {
  enabled?: boolean;
  frequency?: HeartbeatFrequency;
  metadata?: { excludedDirectorAgentIds?: string[] } | null;
}

interface DirectorFanoutResult {
  directorAgentId: string;
  ok: boolean;
  roomId?: string;
  messageId?: string;
  error?: string;
}

/**
 * Shared CEO heartbeat cycle: task_runs lifecycle + LangGraph + pending agent tasks.
 * Used by Temporal ingress and nest_timer tick listener so runId always matches task_runs.id.
 */
@Injectable()
export class CeoHeartbeatRunCoordinatorService {
  private readonly logger = new Logger(CeoHeartbeatRunCoordinatorService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly autonomous: AutonomousOrchestratorService,
    private readonly pendingAgentTasks: PendingAgentTaskExecutionService,
    private readonly monitoring: MonitoringService,
    private readonly coordination: CompanyExecutionCoordinationService,
  ) {}

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  private rpcTimeoutMs() {
    return this.config.getApiRpcTimeoutMs();
  }

  private async appendRunLog(
    companyId: string,
    runId: string,
    data: {
      stepType: string;
      message: string;
      outputSnapshot?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.apiRpc
          .send('tasks.executionLog.appendForRun', {
            companyId,
            actor: this.actor(),
            runId,
            data: { stepType: data.stepType, traceId: runId, message: data.message, outputSnapshot: data.outputSnapshot },
          })
          .pipe(timeout(this.rpcTimeoutMs())),
      );
    } catch {
      // non-blocking
    }
  }

  private mapFrequencyToPeriod(freq: HeartbeatFrequency): 'daily' | 'weekly' | 'monthly' {
    if (freq === 'weekly') return 'weekly';
    return 'daily';
  }

  private safeParseExcludedDirectors(config: CompanyHeartbeatConfigRpc | null): string[] {
    const raw = config?.metadata?.excludedDirectorAgentIds;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
  }

  private async getCompanyHeartbeatConfig(companyId: string): Promise<CompanyHeartbeatConfigRpc | null> {
    try {
      return await firstValueFrom(
        this.apiRpc
          .send<CompanyHeartbeatConfigRpc>('companies.heartbeat.getConfig', {
            companyId,
            actor: this.actor(),
          })
          .pipe(timeout(this.rpcTimeoutMs())),
      );
    } catch {
      return null;
    }
  }

  private async listCompanyDirectors(companyId: string): Promise<string[]> {
    const pageSize = 100;
    const ids: string[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await firstValueFrom(
        this.apiRpc
          .send<{ items?: { id?: string }[]; totalPages?: number }>('agents.findAll', {
            companyId,
            actor: this.actor(),
            role: 'director',
            status: 'active',
            pageSize,
            page,
          })
          .pipe(timeout(this.rpcTimeoutMs())),
      );
      for (const x of res?.items ?? []) {
        const id = String(x?.id ?? '').trim();
        if (id) ids.push(id);
      }
      totalPages = Number(res?.totalPages ?? 0);
      page += 1;
    } while (page <= totalPages);
    return ids;
  }

  private async isDirectorFanoutDone(companyId: string, runId: string): Promise<boolean> {
    try {
      const logs = await firstValueFrom(
        this.apiRpc
          .send<{ items?: { stepType?: string }[] }>('tasks.executionLogs.listByRunId', {
            companyId,
            actor: this.actor(),
            runId,
            limit: 200,
          })
          .pipe(timeout(this.rpcTimeoutMs())),
      );
      return Boolean((logs?.items ?? []).some((x) => x?.stepType === 'ceo.director_fanout.complete'));
    } catch {
      return false;
    }
  }

  private async runDirectorFanoutAndAggregate(
    companyId: string,
    runId: string,
    tickAt: string,
  ): Promise<void> {
    const t0 = Date.now();
    if (await this.isDirectorFanoutDone(companyId, runId)) {
      await this.appendRunLog(companyId, runId, {
        stepType: 'ceo.director_fanout.skip',
        message: 'already_done',
      });
      return;
    }

    const cfg = await this.getCompanyHeartbeatConfig(companyId);
    if (cfg?.enabled === false) {
      await this.appendRunLog(companyId, runId, {
        stepType: 'ceo.director_fanout.skip',
        message: 'disabled',
      });
      return;
    }

    const excluded = new Set(this.safeParseExcludedDirectors(cfg));
    const period = this.mapFrequencyToPeriod(cfg?.frequency ?? 'daily');
    const directors = (await this.listCompanyDirectors(companyId)).filter((id) => !excluded.has(id));

    await this.appendRunLog(companyId, runId, {
      stepType: 'ceo.director_fanout.start',
      message: `directors=${directors.length} period=${period}`,
      outputSnapshot: { period, directorCount: directors.length, excludedDirectorCount: excluded.size },
    });

    const settled = await Promise.allSettled(
      directors.map(async (directorAgentId): Promise<DirectorFanoutResult> => {
        const res = await firstValueFrom(
          this.apiRpc
            .send<{ roomId?: string; messageId?: string }>('tasks.director.generateProgressReport', {
              companyId,
              actor: this.actor(),
              directorAgentId,
              period,
            })
            .pipe(timeout(this.rpcTimeoutMs())),
        );
        return { directorAgentId, ok: true, roomId: res?.roomId, messageId: res?.messageId };
      }),
    );

    const results: DirectorFanoutResult[] = settled.map((it, idx) => {
      const directorAgentId = directors[idx]!;
      if (it.status === 'fulfilled') return it.value;
      return {
        directorAgentId,
        ok: false,
        error: it.reason instanceof Error ? it.reason.message : String(it.reason),
      };
    });
    const success = results.filter((r) => r.ok).length;
    const failed = results.length - success;
    for (let i = 0; i < success; i += 1) this.monitoring.recordDirectorFanoutOutcome('success');
    for (let i = 0; i < failed; i += 1) this.monitoring.recordDirectorFanoutOutcome('failed');
    const riskLevel: 'low' | 'medium' | 'high' =
      failed === 0 ? 'low' : success === 0 ? 'high' : 'medium';

    const summary = `Heartbeat ${tickAt}: directors=${results.length}, success=${success}, failed=${failed}, risk=${riskLevel}`;
    try {
      await firstValueFrom(
        this.apiRpc
          .send('memory.entries.store', {
            companyId,
            actor: this.actor(),
            data: {
              namespace: 'heartbeat:company',
              collectionLabel: `heartbeat:${tickAt}`,
              sourceType: 'summary',
              content: summary,
              metadata: { traceId: runId, runId, tickAt, directorStats: { total: results.length, success, failed }, riskLevel },
            },
          })
          .pipe(timeout(this.rpcTimeoutMs())),
      );
      this.monitoring.recordHeartbeatMemoryIngestOutcome('success');
    } catch (e: unknown) {
      this.monitoring.recordHeartbeatMemoryIngestOutcome('failed');
      await this.appendRunLog(companyId, runId, {
        stepType: 'ceo.aggregation.memory.error',
        message: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400),
      });
    }

    await this.appendRunLog(companyId, runId, {
      stepType: 'ceo.director_fanout.complete',
      message: 'ok',
      outputSnapshot: {
        period,
        riskLevel,
        directorStats: { total: results.length, success, failed },
        reports: results.map((r) => ({
          directorAgentId: r.directorAgentId,
          ok: r.ok,
          messageId: r.messageId ?? null,
          error: r.error ? r.error.slice(0, 300) : null,
        })),
        summary,
      },
    });
    this.monitoring.observeAggregationSeconds((Date.now() - t0) / 1000);
  }

  /**
   * 共享周期核心：task_runs → LangGraph →（可选 Director fan-out）→ pending → complete/fail。
   */
  async executeCycleCore(params: ExecuteCycleCoreParams): Promise<{ runId: string; completedTaskIds: string[] }> {
    const actor = this.actor();
    const tm = this.rpcTimeoutMs();
    const opts = params.opts ?? {};
    const triggerRef = params.triggerRef?.trim() || undefined;

    let runId = opts.existingRunId?.trim() ?? '';
    if (!runId) {
      const runKind =
        params.taskRunTriggerSource === 'task_completed' ||
        params.taskRunTriggerSource === 'budget_warning'
          ? 'autonomous_event'
          : 'ceo_heartbeat';
      const started = await firstValueFrom(
        this.apiRpc
          .send<Record<string, unknown>>('tasks.run.start', {
            companyId: params.companyId,
            actor,
            triggerSource: params.taskRunTriggerSource,
            temporalWorkflowId: opts.temporalWorkflowId ?? undefined,
            temporalRunId: opts.temporalRunId ?? undefined,
            metadata: {
              kind: runKind,
              tickAt: params.tickAt,
              triggerRef: triggerRef ?? null,
              ...opts.metadata,
            },
          })
          .pipe(timeout(tm)),
      );
      runId = String(started?.id ?? '');
      if (!runId) {
        throw new Error('tasks.run.start returned no id');
      }
    }

    let completedTaskIds: string[] = [];
    const t0 = Date.now();
    const metricsTrigger = params.taskRunTriggerSource;
    const tier: HeartbeatCeoGraphTier = opts.heartbeatTier ?? 'full';
    const tierReason = opts.heartbeatTierReason ?? 'default_full';
    try {
      if (tier === 'cheap') {
        this.monitoring.recordHeartbeatTier('cheap', tierReason);
        this.logger.log('foundry.ceo.heartbeat.tier_decision', {
          companyId: params.companyId,
          runId,
          tier,
          reason: tierReason,
        });
        await this.appendRunLog(params.companyId, runId, {
          stepType: 'ceo.graph.skip',
          message: tierReason,
          outputSnapshot: { tier, reason: tierReason },
        });
      } else {
        await this.autonomous.runHeartbeat(params.companyId, params.tickAt, {
          triggerSource: params.autonomousTriggerSource,
          traceId: runId,
          triggerRef,
        });
        const fp = opts.heartbeatFingerprint?.trim();
        if (fp) {
          await this.coordination.saveHeartbeatFingerprint(params.companyId, fp);
        }
        await this.coordination.recordLastFullGraphAt(params.companyId);
        this.monitoring.recordHeartbeatTier('full', tierReason);
        this.logger.log('foundry.ceo.heartbeat.tier_decision', {
          companyId: params.companyId,
          runId,
          tier: 'full',
          reason: tierReason,
        });
      }
      if (params.includeDirectorFanout) {
        await this.runDirectorFanoutAndAggregate(params.companyId, runId, params.tickAt);
      }
      try {
        const pendingResult = await this.pendingAgentTasks.processPendingForCompany(params.companyId, runId);
        completedTaskIds = pendingResult?.completedTaskIds ?? [];
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('processPendingForCompany failed after heartbeat', {
          companyId: params.companyId,
          runId,
          message,
        });
      }
      try {
        await firstValueFrom(
          this.apiRpc
            .send('agents.skills.gcExpiredTemporary', { companyId: params.companyId, actor })
            .pipe(timeout(tm)),
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('agents.skills.gcExpiredTemporary failed', {
          companyId: params.companyId,
          runId,
          message,
        });
      }
      await firstValueFrom(
        this.apiRpc.send('tasks.run.complete', { companyId: params.companyId, actor, runId }).pipe(timeout(tm)),
      );
      this.monitoring.recordTaskRunOutcome('success', metricsTrigger);
      this.monitoring.incAutonomousRunCycle('success', metricsTrigger);
      this.monitoring.observeCeoHeartbeatSeconds(metricsTrigger, (Date.now() - t0) / 1000);
      return { runId, completedTaskIds };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      try {
        await firstValueFrom(
          this.apiRpc
            .send('tasks.run.fail', {
              companyId: params.companyId,
              actor,
              runId,
              errorSummary: message.slice(0, 4000),
            })
            .pipe(timeout(tm)),
        );
      } catch (failErr: unknown) {
        this.logger.error('tasks.run.fail RPC failed', {
          runId,
          message: failErr instanceof Error ? failErr.message : String(failErr),
        });
      }
      this.monitoring.recordTaskRunOutcome('failed', metricsTrigger);
      this.monitoring.incAutonomousRunCycle('failed', metricsTrigger);
      this.monitoring.observeCeoHeartbeatSeconds(metricsTrigger, (Date.now() - t0) / 1000);
      throw e;
    }
  }

  /**
   * One full heartbeat run: start (unless existingRunId) → CEO graph → pending agents → complete/fail.
   */
  async runCycle(
    companyId: string,
    tickAt: string,
    triggerSource: CeoHeartbeatTriggerSource,
    opts: CeoHeartbeatRunCoordinatorOptions = {},
  ): Promise<{ runId: string; completedTaskIds: string[] }> {
    return this.executeCycleCore({
      companyId,
      tickAt,
      taskRunTriggerSource: triggerSource,
      autonomousTriggerSource: 'schedule',
      includeDirectorFanout: false,
      opts,
    });
  }
}
