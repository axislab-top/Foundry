import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent, TaskHeartbeatTickEvent } from '@contracts/events';
import { ConfigService } from '../../common/config/config.service.js';

/**
 * 注册 company.created 的公司，并周期性发布 task.heartbeat.tick，供扫描待办等自治逻辑消费。
 */
@Injectable()
export class TaskHeartbeatScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskHeartbeatScheduler.name);
  private readonly companyIds = new Set<string>();
  private timer?: NodeJS.Timeout;
  private rrCursor = 0;

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
  ) {}

  /** 测试或运维可手动注入已知公司 ID */
  registerCompanyId(companyId: string): void {
    if (companyId) this.companyIds.add(companyId);
  }

  onModuleInit(): void {
    this.messaging.subscribeWithBackoff<CompanyCreatedEvent>(
      'company.created',
      (event: CompanyCreatedEvent) => {
        const id = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
        if (id) {
          this.companyIds.add(id);
          this.logger.debug(`task heartbeat registry +1: ${id}`);
        }
      },
      {
        queue: 'worker-task-heartbeat-registry',
        durable: true,
        prefetchCount: 20,
      },
    );

    if (this.config.getTaskHeartbeatSource() === 'temporal') {
      this.logger.log(
        'TASK_HEARTBEAT_SOURCE=temporal: Nest interval disabled (use Temporal + temporal-worker)',
      );
      return;
    }
    const tickMs = this.config.getTaskHeartbeatIntervalMs();
    this.timer = setInterval(() => {
      void this.publishTicks();
    }, tickMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async publishTicks(): Promise<void> {
    if (this.companyIds.size === 0) return;
    const tickAt = new Date().toISOString();
    const ids = Array.from(this.companyIds);
    const cap = Math.max(1, this.config.getTaskHeartbeatMaxCompaniesPerTick());
    const batchSize = Math.min(ids.length, cap);
    const batch: string[] = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = (this.rrCursor + i) % ids.length;
      batch.push(ids[idx]!);
    }
    this.rrCursor = (this.rrCursor + batchSize) % ids.length;

    if (ids.length > batchSize) {
      this.logger.warn('task heartbeat throttled by cap', {
        totalCompanies: ids.length,
        batchSize,
        nextCursor: this.rrCursor,
      });
    }

    for (const companyId of batch) {
      try {
        const event: TaskHeartbeatTickEvent = {
          eventId: randomUUID(),
          eventType: 'task.heartbeat.tick',
          aggregateId: companyId,
          aggregateType: 'company',
          occurredAt: tickAt,
          version: 1,
          companyId,
          data: { companyId, tickAt },
        };
        await this.messaging.publish(event, {
          routingKey: 'task.heartbeat.tick',
          persistent: true,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('task.heartbeat.tick publish failed', {
          companyId,
          message,
        });
      }
    }
  }
}
