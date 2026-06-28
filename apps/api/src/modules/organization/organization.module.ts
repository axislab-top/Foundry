import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createRequire } from 'node:module';
import { CacheModule } from '../../common/cache/cache.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { OrganizationNode } from './entities/organization-node.entity.js';
import { OrganizationAuditLog } from './entities/organization-audit-log.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { OrganizationController } from './controllers/organization.controller.js';
import { OrganizationToolsInternalController } from './controllers/organization-tools-internal.controller.js';
import { OrganizationService } from './services/organization.service.js';
import { OrganizationTreeService } from './services/organization-tree.service.js';
import { OrganizationInitializerService } from './services/organization-initializer.service.js';
import { OrgRosterService } from './services/org-roster.service.js';
import { OrganizationCompanyCreatedListener } from './listeners/company-created.listener.js';
import { OrganizationRpcController } from './organization.rpc.controller.js';
import { MemoryModule } from '../memory/memory.module.js';
import { Agent } from '../agents/entities/agent.entity.js';

const require = createRequire(import.meta.url);

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationNode, OrganizationAuditLog, CompanyMembership, Agent]),
    CacheModule,
    forwardRef(() => AgentsModule),
    SkillsModule,
    MemoryModule,
    forwardRef(() => require('../collaboration/collaboration.module.js').CollaborationModule),
  ],
  controllers: [OrganizationController, OrganizationRpcController, OrganizationToolsInternalController],
  providers: [
    OrganizationService,
    OrganizationTreeService,
    OrganizationInitializerService,
    OrganizationCompanyCreatedListener,
    OrgRosterService,
  ],
  exports: [OrganizationService, OrganizationInitializerService, OrgRosterService],
})
export class OrganizationModule {}
