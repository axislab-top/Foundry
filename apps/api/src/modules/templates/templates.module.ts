import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { Agent } from '../agents/entities/agent.entity.js';
import { AgentsModule } from '../agents/agents.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../llm-keys/entities/llm-key-daily-usage.entity.js';
import { Skill } from '../skills/entities/skill.entity.js';
import { SkillRevision } from '../skills/entities/skill-revision.entity.js';
import { CompanyTemplate } from './entities/company-template.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from './entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgent } from './entities/marketplace-agent.entity.js';
import { PlatformDepartment } from './entities/platform-department.entity.js';
import { PlatformDepartmentAuditLog } from './entities/platform-department-audit-log.entity.js';
import { MarketplaceHireRequest } from './entities/marketplace-hire-request.entity.js';
import { MarketplaceAgentKeyBinding } from './entities/marketplace-agent-key-binding.entity.js';
import { MarketplaceBindingsCacheModule } from './marketplace-bindings-cache.module.js';
import { MarketplaceAgentSubscription } from './entities/marketplace-agent-subscription.entity.js';
import { MarketplaceSkillPackage } from './entities/marketplace-skill-package.entity.js';
import { MarketplaceSkillSubscription } from './entities/marketplace-skill-subscription.entity.js';
import { TemplateAgentMapping } from './entities/template-agent-mapping.entity.js';
import { TemplateContent } from './entities/template-content.entity.js';
import { AgentPurchaseService } from './services/agent-purchase.service.js';
import { CompanyCeoLayerConfig } from '../companies/entities/company-ceo-layer-config.entity.js';
import { MarketplaceAdminService } from './services/marketplace-admin.service.js';
import { MarketplaceSkillVersionService } from './services/marketplace-skill-version.service.js';
import { PlatformDepartmentsAdminService } from './services/platform-departments-admin.service.js';
import { MarketplaceHireRequestsService } from './services/marketplace-hire-requests.service.js';
import { MarketplaceService } from './services/marketplace.service.js';
import { MarketplaceCatalogPricingService } from './services/marketplace-catalog-pricing.service.js';
import { TemplateImporterService } from './services/template-importer.service.js';
import { TemplatesService } from './services/templates.service.js';
import { RecommendedSkillsValidator } from './validators/recommended-skills.validator.js';
import { MarketplaceHireRequestsController } from './marketplace-hire-requests.controller.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesRpcController } from './templates.rpc.controller.js';
import { Project } from '../projects/entities/project.entity.js';
import { Task } from '../tasks/entities/task.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { BillingModule } from '../billing/billing.module.js';
import { LlmKeysModule } from '../llm-keys/llm-keys.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { ApprovalModule } from '../approval/approval.module.js';
import { MarketplaceAgentDailyBillingListener } from './listeners/marketplace-agent-daily-billing.listener.js';
import { MarketplaceSkillPackagesService } from './services/marketplace-skill-packages.service.js';
import { DefaultCeoMarketplaceTemplateInitializerService } from '../../common/utils/default-ceo-marketplace-template.initializer.service.js';

@Module({
  imports: [
    MarketplaceBindingsCacheModule,
    TypeOrmModule.forFeature([
      CompanyTemplate,
      TemplateContent,
      MarketplaceAgent,
      PlatformDepartment,
      PlatformDepartmentAuditLog,
      MarketplaceHireRequest,
      MarketplaceAgentKeyBinding,
      LlmModel,
      CompanyMarketplaceAgentKeyAssignment,
      MarketplaceAgentSubscription,
      MarketplaceSkillPackage,
      MarketplaceSkillSubscription,
      LlmKey,
      LlmKeyDailyUsage,
      Skill,
      SkillRevision,
      TemplateAgentMapping,
      Agent,
      Project,
      Task,
      OrganizationNode,
      CompanyCeoLayerConfig,
    ]),
    MessagingModule,
    CompaniesModule,
    CollaborationModule,
    AgentsModule,
    MemoryModule,
    BillingModule,
    LlmKeysModule,
    SkillsModule,
    forwardRef(() => ApprovalModule),
  ],
  controllers: [TemplatesController, TemplatesRpcController, MarketplaceHireRequestsController],
  providers: [
    TemplatesService,
    MarketplaceService,
    MarketplaceCatalogPricingService,
    MarketplaceSkillVersionService,
    MarketplaceAdminService,
    PlatformDepartmentsAdminService,
    RecommendedSkillsValidator,
    TemplateImporterService,
    AgentPurchaseService,
    MarketplaceHireRequestsService,
    MarketplaceAgentDailyBillingListener,
    MarketplaceSkillPackagesService,
    DefaultCeoMarketplaceTemplateInitializerService,
  ],
  exports: [
    TemplatesService,
    MarketplaceService,
    MarketplaceAdminService,
    PlatformDepartmentsAdminService,
    TemplateImporterService,
    AgentPurchaseService,
    MarketplaceSkillPackagesService,
  ],
})
export class TemplatesModule {}
