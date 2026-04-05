import { Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AutonomousOrchestratorService } from '../autonomous/autonomous-orchestrator.service.js';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';

export interface CompanyHeartbeatIngressBody {
  companyId: string;
  runId?: string;
  temporalWorkflowId?: string;
  temporalRunId?: string;
}

/**
 * Temporal / 内部编排调用的公司心跳入口：task_runs 生命周期 + CEO 图 + 待执行 Agent 任务。
 */
@Injectable()
export class TemporalHeartbeatIngressService {
  private readonly logger = new Logger(TemporalHeartbeatIngressService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly autonomous: AutonomousOrchestratorService,
    private readonly pendingAgentTasks: PendingAgentTaskExecutionService,
  ) {}

  assertInternalAuth(headerValue: string | undefined): void {
    const expected = this.config.getWorkerInternalApiSecret();
    if (!expected) {
      throw new ServiceUnavailableException('WORKER_INTERNAL_API_SECRET is not configured');
    }
    if (!headerValue || headerValue !== expected) {
      throw new UnauthorizedException('Invalid internal auth');
    }
  }

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  private rpcTimeoutMs() {
    return this.config.getApiRpcTimeoutMs();
  }

  async execute(body: CompanyHeartbeatIngressBody): Promise<{ runId: string; ok: true }> {
    const { companyId } = body;
    const actor = this.actor();
    const tm = this.rpcTimeoutMs();

    let runId = body.runId?.trim() || '';
    if (!runId) {
      const started = await firstValueFrom(
        this.apiRpc
          .send<Record<string, unknown>>('tasks.run.start', {
            companyId,
            actor,
            triggerSource: 'temporal',
            temporalWorkflowId: body.temporalWorkflowId ?? undefined,
            temporalRunId: body.temporalRunId ?? undefined,
            metadata: {
              kind: 'ceo_heartbeat',
              temporalWorkflowId: body.temporalWorkflowId ?? null,
              temporalRunId: body.temporalRunId ?? null,
            },
          })
          .pipe(timeout(tm)),
      );
      runId = String(started?.id ?? '');
      if (!runId) {
        throw new Error('tasks.run.start returned no id');
      }
    }

    const tickAt = new Date().toISOString();
    try {
      await this.autonomous.runHeartbeat(companyId, tickAt, {
        triggerSource: 'schedule',
        traceId: runId,
      });
      try {
        await this.pendingAgentTasks.processPendingForCompany(companyId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('processPendingForCompany failed after heartbeat', { companyId, message });
      }
      await firstValueFrom(
        this.apiRpc
          .send('tasks.run.complete', { companyId, actor, runId })
          .pipe(timeout(tm)),
      );
      return { runId, ok: true };
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
      throw e;
    }
  }
}
