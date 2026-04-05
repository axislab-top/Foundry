import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module.js';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgent } from '../templates/entities/marketplace-agent.entity.js';
import { MarketplaceAgentKeyBinding } from '../templates/entities/marketplace-agent-key-binding.entity.js';
import { SkillsModule } from '../skills/skills.module.js';
import { AgentsRpcController } from './agents.rpc.controller.js';
import { AgentsController } from './controllers/agents.controller.js';
import { Agent } from './entities/agent.entity.js';
import { AgentAuditLog } from './entities/agent-audit-log.entity.js';
import { AgentSkill } from './entities/agent-skill.entity.js';
import { AgentCreatedDefaultSkillsListener } from './listeners/agent-created-default-skills.listener.js';
import { CompanyCreatedAgentsListener } from './listeners/company-created-agents.listener.js';
import { AgentRecruiterService } from './services/agent-recruiter.service.js';
import { AgentSkillService } from './services/agent-skill.service.js';
import { AgentValidatorService } from './services/agent-validator.service.js';
import { AgentsBootstrapService } from './services/agents-bootstrap.service.js';
import { AgentsService } from './services/agents.service.js';
import { MemoryModule } from '../memory/memory.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agent,
      AgentAuditLog,
      AgentSkill,
      OrganizationNode,
      CompanyMembership,
      LlmKey,
      MarketplaceAgent,
      MarketplaceAgentKeyBinding,
      CompanyMarketplaceAgentKeyAssignment,
    ]),
    CacheModule,
    SkillsModule,
    MemoryModule,
  ],
  controllers: [AgentsController, AgentsRpcController],
  providers: [
    AgentValidatorService,
    AgentsService,
    AgentRecruiterService,
    AgentSkillService,
    AgentsBootstrapService,
    CompanyCreatedAgentsListener,
    AgentCreatedDefaultSkillsListener,
  ],
  exports: [AgentsService, AgentsBootstrapService, AgentSkillService, AgentValidatorService],
})
export class AgentsModule {}
