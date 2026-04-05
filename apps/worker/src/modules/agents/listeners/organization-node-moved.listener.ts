import { Injectable, OnModuleInit } from '@nestjs/common';
import { createLogger, LogLevel } from '@service/logging';
import { MessagingService } from '@service/messaging';
import type { OrganizationNodeMovedEvent } from '@contracts/events';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { SkillAwareAiRuntimeAdapter } from '../adapters/ai-runtime.adapter.js';

/**
 * 组织节点移动后触发 Agent 侧副作用（汇报链视图、运行时监督关系等）。
 * DB 中 agents.organization_node_id 仍指向同一节点 UUID，此处主要作缓存/编排同步挂点。
 */
@Injectable()
export class OrganizationNodeMovedAgentsListener implements OnModuleInit {
  private readonly logger = createLogger({
    service: 'worker-service',
    level: LogLevel.INFO,
  });

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
    private readonly aiRuntime: SkillAwareAiRuntimeAdapter,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<OrganizationNodeMovedEvent>(
      'organization.node.moved',
      (event) => this.handle(event),
      {
        queue: 'worker-organization-node-moved-agents-queue',
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

  private async handle(event: OrganizationNodeMovedEvent): Promise<void> {
    const ok = this.idempotency.markIfNew(
      `organization.node.moved.agents:${event.eventId}`,
      24 * 60 * 60_000,
    );
    if (!ok) {
      this.logger.warn('Duplicate organization.node.moved skipped (agents)', {
        eventId: event.eventId,
      });
      return;
    }

    const companyId =
      resolveCompanyIdFromEvent(event) || event.data.companyId || undefined;
    if (!companyId) {
      return;
    }

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      this.logger.info('Organization node moved (agents hook)', {
        eventId: event.eventId,
        companyId,
        nodeId: event.data.nodeId,
        newParentId: event.data.newParentId,
      });
      await this.aiRuntime.onOrganizationNodeMoved(event as unknown as Record<string, unknown>);
    });
  }
}
