import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../config/config.service.js';

export interface AppendExecutionLogData {
  stepType: string;
  message?: string;
  outputSnapshot?: Record<string, unknown>;
  agentId?: string;
  traceId?: string;
  durationMs?: number;
  billingUnits?: string;
  taskId?: string;
}

/**
 * Worker → API `tasks.executionLog.appendForRun` (run-scoped steps).
 */
@Injectable()
export class WorkerExecutionLogService {
  private readonly logger = new Logger(WorkerExecutionLogService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
  ) {}

  private actor() {
    return {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
  }

  async appendForRun(companyId: string, runId: string, data: AppendExecutionLogData): Promise<void> {
    if (!runId?.trim()) {
      return;
    }
    try {
      await firstValueFrom(
        this.apiRpc
          .send('tasks.executionLog.appendForRun', {
            companyId,
            actor: this.actor(),
            runId,
            data: {
              stepType: data.stepType,
              message: data.message,
              outputSnapshot: data.outputSnapshot,
              agentId: data.agentId,
              traceId: data.traceId ?? runId,
              durationMs: data.durationMs,
              billingUnits: data.billingUnits,
              taskId: data.taskId,
            },
          })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('tasks.executionLog.appendForRun failed', { companyId, runId, message });
    }
  }

  async appendForTask(
    companyId: string,
    taskId: string,
    data: AppendExecutionLogData & { runId?: string },
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.apiRpc
          .send('tasks.executionLog.append', {
            companyId,
            actor: this.actor(),
            id: taskId,
            data: {
              stepType: data.stepType,
              message: data.message,
              outputSnapshot: data.outputSnapshot,
              agentId: data.agentId,
              traceId: data.traceId,
              durationMs: data.durationMs,
              billingUnits: data.billingUnits,
              runId: data.runId,
            },
          })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('tasks.executionLog.append failed', { companyId, taskId, message });
    }
  }
}
