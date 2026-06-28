import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@service/tenant';
import { Agent } from '../agents/entities/agent.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { Project } from './entities/project.entity.js';
import { ProjectsRpcController } from './projects.rpc.controller.js';
import { ProjectsService } from './services/projects.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Task, Agent, CompanyMembership]),
    TenantModule,
  ],
  controllers: [ProjectsRpcController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
