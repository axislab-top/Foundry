import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { MessagingService } from '@service/messaging';
import type { TaskRunFailedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * M5：`task.run.failed` → RPC 启动 Temporal 复盘（或 API 内联执行）。
 */
@Injectable()
export class TaskRunFailedSupervisorListener implements OnModuleInit {
  private readonly logger = new Logger(TaskRunFailedSupervisorListener.name);

  constructor(
    private readonly messaging: MessagingService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskRunFailedEvent>(
      'task.run.failed',
      this.handle.bind(this),
      {
        queue: 'worker-task-run-failed-supervisor',
        durable: true,
        prefetchCount: 3,
        retry: {
          enabled: true,
          maxAttempts: 5,
          initialDelayMs: 2000,
          backoffFactor: 2,
          maxDelayMs: 60_000,
        },
      },
    );
  }

  private async handle(event: TaskRunFailedEvent): Promise<void> {
    if (event.eventType !== 'task.run.failed') {
      return;
    }
    const companyId = event.data.companyId;
    const runId = event.data.runId;
    if (!companyId || !runId) return;

    const actor = {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
    const tm = this.config.getApiRpcTimeoutMs();
    try {
      await firstValueFrom(
        this.apiRpc
          .send('supervisor.review.enqueue', {
            companyId,
            actor,
            runId,
            taskId: event.data.taskId,
            errorSummary: event.data.errorSummary,
          })
          .pipe(timeout(tm)),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('supervisor.review.enqueue failed', { companyId, runId, message });
    }
  }
}
