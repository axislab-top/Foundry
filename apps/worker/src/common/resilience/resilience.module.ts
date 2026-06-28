import { Module } from '@nestjs/common';
import { ResiliencePolicyService } from './resilience-policy.service.js';

@Module({
  providers: [ResiliencePolicyService],
  exports: [ResiliencePolicyService],
})
export class ResilienceModule {}
