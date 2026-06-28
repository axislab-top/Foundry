import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { OrganizationNodeCreatedEvent } from '@contracts/events';
import { MemoryService } from '../services/memory.service.js';
import { agentNamespace, resolveDepartmentMemoryNamespace } from '../utils/memory-namespace.js';

/**
 * 组织节点创建后预置部门 / Agent 记忆集合
 */
@Injectable()
export class OrganizationNodeMemoryListener implements OnModuleInit {
  private readonly logger = new Logger(OrganizationNodeMemoryListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<OrganizationNodeCreatedEvent>(
      'organization.node.created',
      this.handle.bind(this),
      {
        queue: 'api-org-node-memory',
        durable: true,
        prefetchCount: 20,
      },
    );
  }

  private async handle(event: OrganizationNodeCreatedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const { nodeId, type, name, agentId, platformDepartmentSlug } = event.data;
      if (type === 'department') {
        await this.memory.ensureCollection(
          companyId,
          resolveDepartmentMemoryNamespace({
            organizationNodeId: nodeId,
            platformDepartmentSlug: platformDepartmentSlug ?? null,
          }),
          `Dept: ${name}`,
          'organization.node',
        );
      }
      if (agentId) {
        await this.memory.ensureCollection(
          companyId,
          agentNamespace(agentId),
          `Agent: ${name}`,
          'organization.node',
        );
      }
      this.logger.log('memory collections ensured for org node', { nodeId, type });
    });
  }
}
