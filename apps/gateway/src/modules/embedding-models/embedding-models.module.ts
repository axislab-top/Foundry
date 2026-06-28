import { Module } from '@nestjs/common';
import { EmbeddingModelsController } from './embedding-models.controller.js';
import { CompanyEmbeddingSettingsController } from './company-embedding-settings.controller.js';

@Module({
  controllers: [EmbeddingModelsController, CompanyEmbeddingSettingsController],
})
export class EmbeddingModelsModule {}
