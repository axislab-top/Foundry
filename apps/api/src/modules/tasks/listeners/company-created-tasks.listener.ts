import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { CompanyCreatedEvent } from '@contracts/events';
import { TasksService } from '../services/tasks.service.js';

/**
 * company.created 后创建欢迎任务（可选预设），便于仪表盘与任务流立即有数据。
 */
@Injectable()
export class CompanyCreatedTasksListener implements OnModuleInit {
  private readonly logger = new Logger(CompanyCreatedTasksListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly tasksService: TasksService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CompanyCreatedEvent>(
      'company.created',
      this.handle.bind(this),
      {
        queue: 'api-company-created-tasks',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: CompanyCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) ?? event.data?.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      try {
        await this.tasksService.createFromEvent(
          {
            title: '欢迎使用任务操作系统',
            description: '可从战略目标发起拆解，或由协作群聊自动抽取任务。',
            metadata: { bootstrap: true, companyCreatedEventId: event.eventId },
          },
          companyId,
          'bootstrap',
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('bootstrap task after company.created failed', { message });
      }
    });
  }
}
