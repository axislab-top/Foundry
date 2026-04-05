import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmProvider } from './entities/llm-provider.entity.js';
import { LlmProvidersRpcController } from './llm-providers.rpc.controller.js';
import { LlmProvidersService } from './llm-providers.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LlmProvider])],
  controllers: [LlmProvidersRpcController],
  providers: [LlmProvidersService],
  exports: [LlmProvidersService],
})
export class LlmProvidersModule {}

