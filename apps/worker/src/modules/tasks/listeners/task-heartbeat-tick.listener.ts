import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { TaskHeartbeatTickEvent } from '@contracts/events';
import { AutonomousOrchestratorService } from '../../autonomous/autonomous-orchestrator.service.js';
import { PendingAgentTaskExecutionService } from '../pending-agent-tasks.service.js';

/**
 * 消费心跳 tick：触发 CEO LangGraph 流水线（Dashboard + Memory → 汇报草稿）。
 */
@Injectable()
export class TaskHeartbeatTickListener implements OnModuleInit {
  private readonly logger = new Logger(TaskHeartbeatTickListener.name);
  private readonly inFlightCompanies = new Set<string>();

  constructor(
    private readonly messaging: MessagingService,
    private readonly autonomous: AutonomousOrchestratorService,
    private readonly pendingAgentTasks: PendingAgentTaskExecutionService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskHeartbeatTickEvent>(
      'task.heartbeat.tick',
      this.handle.bind(this),
      {
        queue: 'worker-task-heartbeat-tick',
        durable: true,
        prefetchCount: 10,
        retry: {
          enabled: true,
          maxAttempts: 5,
          initialDelayMs: 1000,
          backoffFactor: 2,
          maxDelayMs: 60_000,
        },
      },
    );
  }

  private async handle(event: TaskHeartbeatTickEvent): Promise<void> {
    const { companyId, tickAt } = event.data;
    if (!companyId) {
      return;
    }
    if (this.inFlightCompanies.has(companyId)) {
      this.logger.warn('task.heartbeat.tick skipped: company still in-flight', {
        companyId,
        tickAt,
      });
      return;
    }
    this.inFlightCompanies.add(companyId);
    this.logger.debug('task.heartbeat.tick', { companyId, tickAt });
    try {
      try {
        await this.autonomous.runHeartbeat(companyId, tickAt, {
          triggerSource: 'schedule',
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('autonomous.runHeartbeat failed', { companyId, message });
      }

      try {
        await this.pendingAgentTasks.processPendingForCompany(companyId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('pendingAgentTasks.processPendingForCompany failed', { companyId, message });
      }
    } finally {
      this.inFlightCompanies.delete(companyId);
    }
  }
}
