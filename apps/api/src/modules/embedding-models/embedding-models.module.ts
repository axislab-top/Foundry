import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../agents/entities/agent.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { LlmProvider } from '../llm-providers/entities/llm-provider.entity.js';
import { LlmKey } from '../llm-keys/entities/llm-key.entity.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { EmbeddingModelsRpcController } from './embedding-models.rpc.controller.js';
import { EmbeddingModelsService } from './embedding-models.service.js';
import { EmbeddingResolverService } from './embedding-resolver.service.js';
import { CompanyEmbeddingSetting } from './company-embedding-setting.entity.js';
import { CompanyEmbeddingSettingsService } from './company-embedding-settings.service.js';

@Module({
  imports: [
    PlatformSettingsModule,
    TypeOrmModule.forFeature([
      LlmModel,
      LlmProvider,
      LlmKey,
      Agent,
      CompanyMarketplaceAgentKeyAssignment,
      CompanyEmbeddingSetting,
    ]),
  ],
  controllers: [EmbeddingModelsRpcController],
  providers: [EmbeddingModelsService, CompanyEmbeddingSettingsService, EmbeddingResolverService],
  exports: [EmbeddingModelsService, CompanyEmbeddingSettingsService, EmbeddingResolverService],
})
export class EmbeddingModelsModule {}
