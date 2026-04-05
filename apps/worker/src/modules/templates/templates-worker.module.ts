import { Module } from '@nestjs/common';
import { AutonomousModule } from '../autonomous/autonomous.module.js';
import { AgentPurchasedListener } from './listeners/agent-purchased.listener.js';
import { TemplateImportedListener } from './listeners/template-imported.listener.js';
import { MarketplaceAgentMaterializationService } from './marketplace-agent-materialization.service.js';
import { TemplateMaterializationService } from './template-materialization.service.js';

@Module({
  imports: [AutonomousModule],
  providers: [
    TemplateImportedListener,
    TemplateMaterializationService,
    AgentPurchasedListener,
    MarketplaceAgentMaterializationService,
  ],
})
export class TemplatesWorkerModule {}
