import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '@service/messaging';
import { Agent } from '../agents/entities/agent.entity.js';
import { AgentsModule } from '../agents/agents.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from '../llm-keys/entities/llm-key-daily-usage.entity.js';
import { CompanyTemplate } from './entities/company-template.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from './entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgent } from './entities/marketplace-agent.entity.js';
import { MarketplaceHireRequest } from './entities/marketplace-hire-request.entity.js';
import { MarketplaceAgentKeyBinding } from './entities/marketplace-agent-key-binding.entity.js';
import { TemplateAgentMapping } from './entities/template-agent-mapping.entity.js';
import { TemplateContent } from './entities/template-content.entity.js';
import { AgentPurchaseService } from './services/agent-purchase.service.js';
import { MarketplaceAdminService } from './services/marketplace-admin.service.js';
import { MarketplaceHireRequestsService } from './services/marketplace-hire-requests.service.js';
import { MarketplaceService } from './services/marketplace.service.js';
import { TemplateImporterService } from './services/template-importer.service.js';
import { TemplatesService } from './services/templates.service.js';
import { MarketplaceHireRequestsController } from './marketplace-hire-requests.controller.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesRpcController } from './templates.rpc.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyTemplate,
      TemplateContent,
      MarketplaceAgent,
      MarketplaceHireRequest,
      MarketplaceAgentKeyBinding,
      CompanyMarketplaceAgentKeyAssignment,
      LlmKey,
      LlmKeyDailyUsage,
      TemplateAgentMapping,
      Agent,
    ]),
    MessagingModule,
    CompaniesModule,
    AgentsModule,
  ],
  controllers: [TemplatesController, TemplatesRpcController, MarketplaceHireRequestsController],
  providers: [
    TemplatesService,
    MarketplaceService,
    MarketplaceAdminService,
    TemplateImporterService,
    AgentPurchaseService,
    MarketplaceHireRequestsService,
  ],
  exports: [
    TemplatesService,
    MarketplaceService,
    MarketplaceAdminService,
    TemplateImporterService,
    AgentPurchaseService,
  ],
})
export class TemplatesModule {}
