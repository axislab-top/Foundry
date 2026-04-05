import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '../../common/cache/cache.module.js';
import { LlmKeysModule } from '../llm-keys/llm-keys.module.js';
import { OrganizationModule } from '../organization/organization.module.js';
import { MarketplaceAgent } from '../templates/entities/marketplace-agent.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgentKeyBinding } from '../templates/entities/marketplace-agent-key-binding.entity.js';
import { CompaniesController } from './companies.controller.js';
import { CompaniesRpcController } from './companies.rpc.controller.js';
import { CompaniesService } from './companies.service.js';
import { CompanyQuickCreateService } from './services/company-quick-create.service.js';
import { CompanySetupRecommendationService } from './services/company-setup-recommendation.service.js';
import { Company } from './entities/company.entity.js';
import { CompanyMembership } from './entities/company-membership.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, CompanyMembership, MarketplaceAgent, CompanyMarketplaceAgentKeyAssignment, MarketplaceAgentKeyBinding]),
    CacheModule,
    LlmKeysModule,
    OrganizationModule,
  ],
  controllers: [CompaniesController, CompaniesRpcController],
  providers: [CompaniesService, CompanyQuickCreateService, CompanySetupRecommendationService],
  exports: [CompaniesService, CompanyQuickCreateService],
})
export class CompaniesModule {}
