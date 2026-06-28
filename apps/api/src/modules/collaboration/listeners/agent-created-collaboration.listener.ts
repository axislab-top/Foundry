import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { AgentCreatedEvent } from '@contracts/events';
import { CollaborationOrgSyncService } from '../services/collaboration-org-sync.service.js';

/**
 * Agent 创建后同步协作群：
 * - CEO / director → 主群
 * - 全部 active Agent（含 executor）→ 所属部门群
 */
@Injectable()
export class AgentCreatedCollaborationListener implements OnModuleInit {
  private readonly logger = new Logger(AgentCreatedCollaborationListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly orgSync: CollaborationOrgSyncService,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<AgentCreatedEvent>(
      'agent.created',
      this.handle.bind(this),
      {
        queue: 'collaboration-agent-created-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: AgentCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      await this.orgSync.onAgentCreated(companyId, {
        agentId: event.data.agentId,
        role: event.data.role,
        status: event.data.status,
        organizationNodeId: event.data.organizationNodeId,
      });
      this.logger.log('Agent collaboration rooms synced after hire', {
        companyId,
        agentId: event.data.agentId,
        role: event.data.role,
        organizationNodeId: event.data.organizationNodeId,
        eventId: event.eventId,
      });
    });
  }
}
