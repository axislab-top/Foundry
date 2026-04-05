import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { OrganizationNode } from './entities/organization-node.entity.js';
import { OrganizationAuditLog } from './entities/organization-audit-log.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { OrganizationController } from './controllers/organization.controller.js';
import { OrganizationService } from './services/organization.service.js';
import { OrganizationTreeService } from './services/organization-tree.service.js';
import { OrganizationInitializerService } from './services/organization-initializer.service.js';
import { OrganizationCompanyCreatedListener } from './listeners/company-created.listener.js';
import { OrganizationRpcController } from './organization.rpc.controller.js';
import { MemoryModule } from '../memory/memory.module.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationNode, OrganizationAuditLog, CompanyMembership]),
    CacheModule,
    forwardRef(() => AgentsModule),
    SkillsModule,
    MemoryModule,
    forwardRef(() => CollaborationModule),
  ],
  controllers: [OrganizationController, OrganizationRpcController],
  providers: [
    OrganizationService,
    OrganizationTreeService,
    OrganizationInitializerService,
    OrganizationCompanyCreatedListener,
  ],
  exports: [OrganizationService, OrganizationInitializerService],
})
export class OrganizationModule {}
