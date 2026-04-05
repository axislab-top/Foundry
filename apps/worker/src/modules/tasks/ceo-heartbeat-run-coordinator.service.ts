import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AutonomousOrchestratorService } from '../autonomous/autonomous-orchestrator.service.js';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';

export type CeoHeartbeatTriggerSource = 'temporal' | 'nest_timer';

export interface CeoHeartbeatRunCoordinatorOptions {
  /** When set, skip tasks.run.start and use this run id (Temporal idempotent replay). */
  existingRunId?: string;
  temporalWorkflowId?: string;
  temporalRunId?: string;
  /** Extra metadata stored on task_runs */
  metadata?: Record<string, unknown>;
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

  /**
   * One full heartbeat run: start (unless existingRunId) → CEO graph → pending agents → complete/fail.
   */
  async runCycle(
    companyId: string,
    tickAt: string,
    triggerSource: CeoHeartbeatTriggerSource,
    opts: CeoHeartbeatRunCoordinatorOptions = {},
  ): Promise<{ runId: string }> {
    const actor = this.actor();
    const tm = this.rpcTimeoutMs();

    let runId = opts.existingRunId?.trim() ?? '';
    if (!runId) {
      const started = await firstValueFrom(
        this.apiRpc
          .send<Record<string, unknown>>('tasks.run.start', {
            companyId,
            actor,
            triggerSource,
            temporalWorkflowId: opts.temporalWorkflowId ?? undefined,
            temporalRunId: opts.temporalRunId ?? undefined,
            metadata: {
              kind: 'ceo_heartbeat',
              tickAt,
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

    const t0 = Date.now();
    try {
      await this.autonomous.runHeartbeat(companyId, tickAt, {
        triggerSource: 'schedule',
        traceId: runId,
      });
      try {
        await this.pendingAgentTasks.processPendingForCompany(companyId, runId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('processPendingForCompany failed after heartbeat', { companyId, runId, message });
      }
      await firstValueFrom(
        this.apiRpc.send('tasks.run.complete', { companyId, actor, runId }).pipe(timeout(tm)),
      );
      this.monitoring.recordTaskRunOutcome('success', triggerSource);
      this.monitoring.observeCeoHeartbeatSeconds(triggerSource, (Date.now() - t0) / 1000);
      return { runId };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      try {
        await firstValueFrom(
          this.apiRpc
            .send('tasks.run.fail', {
              companyId,
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
      this.monitoring.recordTaskRunOutcome('failed', triggerSource);
      this.monitoring.observeCeoHeartbeatSeconds(triggerSource, (Date.now() - t0) / 1000);
      throw e;
    }
  }
}
