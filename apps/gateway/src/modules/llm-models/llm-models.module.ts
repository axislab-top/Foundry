import { Module } from '@nestjs/common';
import { LlmModelsController } from './llm-models.controller.js';

@Module({
  controllers: [LlmModelsController],
})
export class LlmModelsModule {}

