import { Module } from '@nestjs/common';
import { LlmProvidersController } from './llm-providers.controller.js';

@Module({
  controllers: [LlmProvidersController],
})
export class LlmProvidersModule {}

