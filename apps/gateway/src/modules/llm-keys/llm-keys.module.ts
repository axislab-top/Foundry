import { Module } from '@nestjs/common';
import { LlmKeysController } from './llm-keys.controller.js';

@Module({
  controllers: [LlmKeysController],
})
export class LlmKeysModule {}

