import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalModule } from '../approval/approval.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { AgentSkill } from '../agents/entities/agent-skill.entity.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { Company } from '../companies/entities/company.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { OrganizationNodeSkill } from '../organization/entities/organization-node-skill.entity.js';
import { FilesModule } from '../files/files.module.js';
import { SkillsController } from './controllers/skills.controller.js';
import { SkillsManagementController } from './controllers/skills-management.controller.js';
import { SkillExecutionLog } from './entities/skill-execution-log.entity.js';
import { SkillAuditLog } from './entities/skill-audit-log.entity.js';
import { Skill } from './entities/skill.entity.js';
import { SkillRevision } from './entities/skill-revision.entity.js';
import { SkillVersion } from './entities/skill-version.entity.js';
import { SkillMcpToolBinding } from './entities/skill-mcp-tool-binding.entity.js';
import { SkillToolBinding } from './entities/skill-tool-binding.entity.js';
import { SkillArtifact } from './entities/skill-artifact.entity.js';
import { SkillExecutedListener } from './listeners/skill-executed.listener.js';
import { EffectiveSkillsService } from './services/effective-skills.service.js';
import { OrganizationNodeSkillsService } from './services/organization-node-skills.service.js';
import { SkillValidatorService } from './services/skill-validator.service.js';
import { SkillsBindingMetricsService } from './services/skills-binding-metrics.service.js';
import { SkillBindingValidatorService } from './services/skill-binding-validator.service.js';
import { SkillsService } from './services/skills.service.js';
import { SkillsManagementService } from './services/skills-management.service.js';
import { SkillMdBridgeService } from './skill-md/skill-md-bridge.service.js';
import { SkillUsageAnalyticsService } from './services/skill-usage-analytics.service.js';
import { SkillsRpcController } from './skills.rpc.controller.js';
import { AdminSkillsRpcController } from './admin-skills.rpc.controller.js';
import { RoleDefaultGlobalSkillsModule } from '../platform-settings/role-default-global-skills.module.js';
import { ToolRegistry } from '@service/ai';
import { Tool } from '../tools/entities/tool.entity.js';
import { McpTool } from '../mcp-tools/entities/mcp-tool.entity.js';
import { ToolVersion } from '../tools/entities/tool-version.entity.js';
import { McpToolVersion } from '../mcp-tools/entities/mcp-tool-version.entity.js';
import { User } from '../users/entities/user.entity.js';
import { AdminUser } from '../admin-users/entities/admin-user.entity.js';

@Module({
  imports: [
    FilesModule,
    RoleDefaultGlobalSkillsModule,
    forwardRef(() => ApprovalModule),
    AlertsModule,
    TypeOrmModule.forFeature([
      Skill,
      SkillRevision,
      SkillVersion,
      SkillMcpToolBinding,
      SkillToolBinding,
      SkillArtifact,
      SkillAuditLog,
      Company,
      CompanyMembership,
      Agent,
      AgentSkill,
      OrganizationNodeSkill,
      OrganizationNode,
      SkillExecutionLog,
      Tool,
      ToolVersion,
      McpTool,
      McpToolVersion,
      User,
      AdminUser,
    ]),
  ],
  controllers: [SkillsController, SkillsManagementController, SkillsRpcController, AdminSkillsRpcController],
  providers: [
    ToolRegistry,
    SkillBindingValidatorService,
    SkillsService,
    SkillsManagementService,
    SkillMdBridgeService,
    SkillUsageAnalyticsService,
    SkillsBindingMetricsService,
    SkillValidatorService,
    EffectiveSkillsService,
    OrganizationNodeSkillsService,
    SkillExecutedListener,
  ],
  exports: [
    SkillsService,
    SkillValidatorService,
    EffectiveSkillsService,
    OrganizationNodeSkillsService,
    SkillBindingValidatorService,
  ],
})
export class SkillsModule {}
