import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import type { TaskHeartbeatFailedEvent, TaskHeartbeatTickEvent } from '@contracts/events';

const COLLABORATION_MESSAGE_RECEIVED_LEGACY_RK = 'collaboration.message.received' as const;
const COLLABORATION_CHAT_MESSAGE_INGESTED_V2_RK = 'collaboration.chat.message.ingested.v2' as const;
import { CompanyOrchestratorService } from '../../company-runtime/company-orchestrator.service.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { CollaborationSessionLeaseService } from '../../collaboration/session/collaboration-session-lease.service.js';
import { CompanyExecutionCoordinationService } from '../../../common/coordination/company-execution-coordination.service.js';

/**
 * 消费心跳 tick：触发 CEO LangGraph 流水线（Dashboard + Memory → 汇报草稿）。
 */
@Injectable()
export class TaskHeartbeatTickListener implements OnModuleInit {
  private readonly logger = new Logger(TaskHeartbeatTickListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly companyOrchestrator: CompanyOrchestratorService,
    private readonly config: ConfigService,
    private readonly collaborationSessionLease: CollaborationSessionLeaseService,
    private readonly coordination: CompanyExecutionCoordinationService,
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
    this.messaging.subscribeWithBackoff<any>(
      'collaboration.human_message.interactive_touch',
      async (event) => this.markInteractiveActivity(event),
      {
        queue: 'worker-task-heartbeat-interactive-activity',
        routingKey: [COLLABORATION_MESSAGE_RECEIVED_LEGACY_RK, COLLABORATION_CHAT_MESSAGE_INGESTED_V2_RK],
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: TaskHeartbeatTickEvent): Promise<void> {
    const { companyId, tickAt } = event.data;
    if (!companyId) {
      return;
    }

    const interactive = await this.coordination.shouldSkipHeartbeatForInteractiveCooldownAsync(companyId);
    if (interactive.skip) {
      this.logger.log('task.heartbeat.tick delayed: recent interactive activity', {
        companyId,
        tickAt,
        sinceInteractiveMs: interactive.sinceInteractiveMs,
        cooldownMs: this.config.getHeartbeatInteractiveCooldownMs(),
      });
      return;
    }

    const minInterval = await this.coordination.shouldSkipHeartbeatForMinIntervalAsync(companyId);
    if (minInterval.skip) {
      this.logger.log('task.heartbeat.tick skipped: min interval guard', {
        companyId,
        tickAt,
        sinceLastRunMs: minInterval.sinceLastRunMs,
        minIntervalMs: this.config.getHeartbeatMinIntervalMs(),
      });
      return;
    }

    const lock = await this.coordination.tryAcquireHeartbeatLock(companyId);
    if (!lock.acquired) {
      this.logger.warn('task.heartbeat.tick skipped: company still in-flight', {
        companyId,
        tickAt,
      });
      return;
    }

    try {
      try {
        if (await this.collaborationSessionLease.isHeavyCollaborationLeaseActive(companyId)) {
          this.logger.log('task.heartbeat.tick skipped: main-room heavy collaboration lease active', {
            companyId,
            tickAt,
          });
          return;
        }
      } catch (e: unknown) {
        this.logger.warn('task.heartbeat.tick lease check failed; continuing heartbeat', {
          companyId,
          tickAt,
          message: e instanceof Error ? e.message : String(e),
        });
      }

      await this.coordination.recordHeartbeatRunAt(companyId);
      this.logger.debug('task.heartbeat.tick', { companyId, tickAt });

      await this.companyOrchestrator.runHeartbeat({
        companyId,
        tickAt,
        triggerSource: 'nest_timer',
        options: {},
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('ceo heartbeat run cycle failed', { companyId, tickAt, message });
      try {
        const failedEvt: TaskHeartbeatFailedEvent = {
          eventId: `task-heartbeat-failed:${companyId}:${tickAt}`,
          eventType: 'task.heartbeat.failed',
          aggregateType: 'company',
          aggregateId: companyId,
          companyId,
          version: 1,
          occurredAt: new Date().toISOString(),
          data: {
            companyId,
            tickAt,
            errorSummary: message.slice(0, 4000),
            failedAt: new Date().toISOString(),
            triggerSource: 'nest_timer',
          },
        };
        await this.messaging.publish(failedEvt);
      } catch (pubErr: unknown) {
        this.logger.warn('task.heartbeat.failed publish skipped', {
          companyId,
          message: pubErr instanceof Error ? pubErr.message : String(pubErr),
        });
      }
      if (this.config.isHeartbeatTickRethrowOnFailure()) {
        throw e;
      }
    } finally {
      await this.coordination.releaseHeartbeatLock(companyId, lock.token);
    }
  }

  private async markInteractiveActivity(event: {
    companyId?: string;
    data?: { senderType?: string };
  }): Promise<void> {
    const companyId = String(event?.companyId ?? '').trim();
    if (!companyId) return;
    const senderType = String(event?.data?.senderType ?? '').trim().toLowerCase();
    if (senderType !== 'human') return;
    await this.coordination.markInteractiveActivity(companyId);
  }
}
