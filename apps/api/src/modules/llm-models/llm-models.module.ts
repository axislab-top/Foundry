import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module.js';
import { LlmProvider } from '../llm-providers/entities/llm-provider.entity.js';
import { LlmModel } from './entities/llm-model.entity.js';
import { LlmModelsService } from './llm-models.service.js';
import { LlmModelsRpcController } from './llm-models.rpc.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([LlmModel, LlmProvider]), BillingModule],
  providers: [LlmModelsService],
  controllers: [LlmModelsRpcController],
  exports: [LlmModelsService],
})
export class LlmModelsModule {}

