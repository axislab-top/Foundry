import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingRecord } from '../billing/entities/billing-record.entity.js';
import { LlmKey } from './entities/llm-key.entity.js';
import { LlmKeyDailyUsage } from './entities/llm-key-daily-usage.entity.js';
import { LlmProvider } from '../llm-providers/entities/llm-provider.entity.js';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { LlmKeysRpcController } from './llm-keys.rpc.controller.js';
import { LlmKeysService } from './llm-keys.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LlmKey, LlmKeyDailyUsage, BillingRecord, LlmProvider, LlmModel])],
  controllers: [LlmKeysRpcController],
  providers: [LlmKeysService],
  exports: [LlmKeysService],
})
export class LlmKeysModule {}

