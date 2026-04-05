import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../agents/entities/agent.entity.js';
import { AgentSkill } from '../agents/entities/agent-skill.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { OrganizationNodeSkill } from '../organization/entities/organization-node-skill.entity.js';
import { FilesModule } from '../files/files.module.js';
import { SkillsController } from './controllers/skills.controller.js';
import { SkillExecutionLog } from './entities/skill-execution-log.entity.js';
import { SkillAuditLog } from './entities/skill-audit-log.entity.js';
import { Skill } from './entities/skill.entity.js';
import { SkillRevision } from './entities/skill-revision.entity.js';
import { SkillArtifact } from './entities/skill-artifact.entity.js';
import { SkillExecutedListener } from './listeners/skill-executed.listener.js';
import { EffectiveSkillsService } from './services/effective-skills.service.js';
import { OrganizationNodeSkillsService } from './services/organization-node-skills.service.js';
import { SkillValidatorService } from './services/skill-validator.service.js';
import { SkillsAdminService } from './services/skills-admin.service.js';
import { SkillsService } from './services/skills.service.js';
import { SkillsRpcController } from './skills.rpc.controller.js';

@Module({
  imports: [
    FilesModule,
    TypeOrmModule.forFeature([
      Skill,
      SkillRevision,
      SkillArtifact,
      SkillAuditLog,
      CompanyMembership,
      Agent,
      AgentSkill,
      OrganizationNodeSkill,
      OrganizationNode,
      SkillExecutionLog,
    ]),
  ],
  controllers: [SkillsController, SkillsRpcController],
  providers: [
    SkillsService,
    SkillsAdminService,
    SkillValidatorService,
    EffectiveSkillsService,
    OrganizationNodeSkillsService,
    SkillExecutedListener,
  ],
  exports: [SkillsService, SkillsAdminService, SkillValidatorService, EffectiveSkillsService, OrganizationNodeSkillsService],
})
export class SkillsModule {}
