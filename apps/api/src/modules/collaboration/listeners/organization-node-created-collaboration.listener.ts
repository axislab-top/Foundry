import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { OrganizationNodeCreatedEvent } from '@contracts/events';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { OrganizationService } from '../../organization/services/organization.service.js';
import { CollaborationOrgSyncService } from '../services/collaboration-org-sync.service.js';

/**
 * 部门组织节点创建后：确保部门群存在，并同步主管/子树内 Agent 成员。
 */
@Injectable()
export class OrganizationNodeCreatedCollaborationListener implements OnModuleInit {
  private readonly logger = new Logger(OrganizationNodeCreatedCollaborationListener.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly orgSync: CollaborationOrgSyncService,
    private readonly organizationService: OrganizationService,
    @InjectRepository(OrganizationNode)
    private readonly orgNodesRepo: Repository<OrganizationNode>,
  ) {}

  onModuleInit() {
    this.messagingService.subscribeWithBackoff<OrganizationNodeCreatedEvent>(
      'organization.node.created',
      this.handle.bind(this),
      {
        queue: 'collaboration-org-node-created-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(event: OrganizationNodeCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId || event.data.type !== 'department') return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const node =
        (await this.orgNodesRepo.findOne({ where: { id: event.data.nodeId, companyId } })) ??
        (await this.orgNodesRepo.findOne({ where: { id: event.data.nodeId } }));
      if (!node || node.type !== 'department') return;

      const headAgentId = event.data.agentId ?? node.agentId ?? undefined;
      const { room, created } = await this.orgSync.onDepartmentNodeCreated(companyId, node, {
        headAgentId,
      });
      if (created) {
        await this.organizationService.getRoomOrgSnapshot(room.id);
      }

      this.logger.log('Department collaboration room ensured after org node created', {
        companyId,
        nodeId: node.id,
        roomId: room.id,
        eventId: event.eventId,
      });
    });
  }
}
