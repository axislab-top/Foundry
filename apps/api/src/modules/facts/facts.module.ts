import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@service/tenant';
import { Agent } from '../agents/entities/agent.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { User } from '../users/entities/user.entity.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { OrganizationModule } from '../organization/organization.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { FactsRpcController } from './facts.rpc.controller.js';
import { FactsService } from './facts.service.js';

@Module({
  imports: [
    TenantModule,
    CollaborationModule,
    OrganizationModule,
    MemoryModule,
    TypeOrmModule.forFeature([Agent, CompanyMembership, User]),
  ],
  controllers: [FactsRpcController],
  providers: [FactsService],
  exports: [FactsService],
})
export class FactsModule {}

