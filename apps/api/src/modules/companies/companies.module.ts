import { forwardRef, Module } from '@nestjs/common';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module.js';
import { LlmKeysModule } from '../llm-keys/llm-keys.module.js';
import { OrganizationModule } from '../organization/organization.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { MemoryModule } from '../memory/memory.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { SkillRuntimeResolverService } from './services/skill-runtime-resolver.service.js';
import { CeoLayerConfigService } from './services/ceo-layer-config.service.js';
import { SkillBindingService } from './services/skill-binding.service.js';
import { MarketplaceAgent } from '../templates/entities/marketplace-agent.entity.js';
import { PlatformDepartment } from '../templates/entities/platform-department.entity.js';
import { CompanyTemplate } from '../templates/entities/company-template.entity.js';
import { TemplateContent } from '../templates/entities/template-content.entity.js';
import { MarketplaceAgentKeyBinding } from '../templates/entities/marketplace-agent-key-binding.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { CompaniesController } from './companies.controller.js';
import { CompaniesRpcController } from './companies.rpc.controller.js';
import { CompaniesService } from './companies.service.js';
import { CompanyQuickCreateService } from './services/company-quick-create.service.js';
import { CompanyCreationQuotaService } from './services/company-creation-quota.service.js';
import { CompanySetupRecommendationService } from './services/company-setup-recommendation.service.js';
import { CompanyTemplateEngineService } from './services/company-template-engine.service.js';
import { PlatformDepartmentCatalogService } from './services/platform-department-catalog.service.js';
import { MarketplaceMemberAssignmentService } from './services/marketplace-member-assignment.service.js';
import { Company } from './entities/company.entity.js';
import { CompanyMembership } from './entities/company-membership.entity.js';
import { CompanyHeartbeatConfig } from './entities/company-heartbeat-config.entity.js';
import { CompanyCeoLayerConfig } from './entities/company-ceo-layer-config.entity.js';
import { CompanyRuntimePreferenceModule } from './company-runtime-preference.module.js';
import { CompanyToolsetSetting } from './entities/company-toolset-setting.entity.js';
import { CompanyToolsetSettingsService } from './services/company-toolset-settings.service.js';
import { CompanyToolsetSettingsRpcController } from './company-toolset-settings.rpc.controller.js';
import { ApprovalModule } from '../approval/approval.module.js';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyMembership,
      CompanyHeartbeatConfig,
      CompanyCeoLayerConfig,
      Agent,
      MarketplaceAgent,
      MarketplaceAgentKeyBinding,
      CompanyMarketplaceAgentKeyAssignment,
      PlatformDepartment,
      CompanyTemplate,
      TemplateContent,
      CompanyToolsetSetting,
    ]),
    CacheModule,
    LlmKeysModule,
    forwardRef(() => AgentsModule),
    forwardRef(() => ApprovalModule),
    OrganizationModule,
    MemoryModule,
    SkillsModule,
    CompanyRuntimePreferenceModule,
    forwardRef(() => CollaborationModule),
  ],
  controllers: [CompaniesController, CompaniesRpcController, CompanyToolsetSettingsRpcController],
  providers: [
    CompaniesService,
    CompanyToolsetSettingsService,
    CompanyQuickCreateService,
    CompanyCreationQuotaService,
    CompanySetupRecommendationService,
    PlatformDepartmentCatalogService,
    MarketplaceMemberAssignmentService,
    CompanyTemplateEngineService,
    SkillRuntimeResolverService,
    SkillBindingService,
    CeoLayerConfigService,
  ],
  exports: [
    CompaniesService,
    CompanyQuickCreateService,
    CompanyCreationQuotaService,
    SkillRuntimeResolverService,
    SkillBindingService,
    CeoLayerConfigService,
    CompanyToolsetSettingsService,
  ],
})
export class CompaniesModule {}
