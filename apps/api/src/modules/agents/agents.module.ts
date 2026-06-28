import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgent } from '../templates/entities/marketplace-agent.entity.js';
import { PlatformDepartment } from '../templates/entities/platform-department.entity.js';
import { MarketplaceAgentKeyBinding } from '../templates/entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceBindingsCacheModule } from '../templates/marketplace-bindings-cache.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { AgentsRpcController } from './agents.rpc.controller.js';
import { AgentsController } from './controllers/agents.controller.js';
import { Agent } from './entities/agent.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { AgentWorkspaceService } from './services/agent-workspace.service.js';
import { AgentAuditLog } from './entities/agent-audit-log.entity.js';
import { AgentSkill } from './entities/agent-skill.entity.js';
import { AgentCreatedDefaultSkillsListener } from './listeners/agent-created-default-skills.listener.js';
import { CompanyCreatedAgentsListener } from './listeners/company-created-agents.listener.js';
import { AgentRecruiterService } from './services/agent-recruiter.service.js';
import { AgentSkillService } from './services/agent-skill.service.js';
import { AgentHierarchyService } from './services/agent-hierarchy.service.js';
import { AgentValidatorService } from './services/agent-validator.service.js';
import { AgentsBootstrapService } from './services/agents-bootstrap.service.js';
import { AgentExecutionRolesService } from './services/agent-execution-roles.service.js';
import { BootstrapSkillCatalogService } from './services/bootstrap-skill-catalog.service.js';
import { AgentsService } from './services/agents.service.js';
import { MemoryModule } from '../memory/memory.module.js';
import { DepartmentHeadResolverService } from './services/department-head-resolver.service.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { ApprovalModule } from '../approval/approval.module.js';
import { ToolRegistry } from '@service/ai';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agent,
      AgentAuditLog,
      AgentSkill,
      OrganizationNode,
      Task,
      CompanyMembership,
      LlmKey,
      MarketplaceAgent,
      PlatformDepartment,
      MarketplaceAgentKeyBinding,
      CompanyMarketplaceAgentKeyAssignment,
    ]),
    MarketplaceBindingsCacheModule,
    CacheModule,
    SkillsModule,
    PlatformSettingsModule,
    MemoryModule,
    forwardRef(() => CompaniesModule),
    forwardRef(() => ApprovalModule),
  ],
  controllers: [AgentsController, AgentsRpcController],
  providers: [
    ToolRegistry,
    AgentValidatorService,
    AgentsService,
    AgentWorkspaceService,
    AgentRecruiterService,
    AgentSkillService,
    AgentHierarchyService,
    DepartmentHeadResolverService,
    AgentsBootstrapService,
    AgentExecutionRolesService,
    BootstrapSkillCatalogService,
    CompanyCreatedAgentsListener,
    AgentCreatedDefaultSkillsListener,
  ],
  exports: [
    AgentsService,
    AgentWorkspaceService,
    AgentsBootstrapService,
    AgentSkillService,
    AgentExecutionRolesService,
    AgentHierarchyService,
    AgentValidatorService,
    DepartmentHeadResolverService,
  ],
})
export class AgentsModule {}
