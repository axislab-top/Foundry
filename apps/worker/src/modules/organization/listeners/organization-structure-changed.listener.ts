import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';

interface OrganizationStructureChangedEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  occurredAt: string;
  version: number;
  companyId?: string;
  data: {
    companyId: string;
    reason: string;
  };
}

@Injectable()
export class OrganizationStructureChangedListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async onModuleInit() {
    await this.messagingService.subscribe<OrganizationStructureChangedEvent>(
      'organization.structure.changed',
      this.handle.bind(this),
      {
        queue: 'organization-structure-changed-queue',
        durable: true,
        prefetchCount: 10,
      },
    );
  }

  private async handle(event: OrganizationStructureChangedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) {
      return;
    }

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      // 下游副作用挂点：可在此触发 Agents/Collaboration/Tasks 同步。
      this.logger.info('Organization structure changed consumed', {
        eventId: event.eventId,
        companyId,
        reason: event.data.reason,
      });
    });
  }
}
