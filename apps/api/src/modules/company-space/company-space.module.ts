import { Module } from '@nestjs/common';
import { ApiRunnerRpcModule } from '../../common/runner/api-runner-rpc.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { ApprovalModule } from '../approval/approval.module.js';
import { CompanyRuntimePreferenceModule } from '../companies/company-runtime-preference.module.js';
import { CompanySpaceRpcController } from './company-space.rpc.controller.js';
import { CompanySpaceService } from './company-space.service.js';

@Module({
  imports: [
    ApiRunnerRpcModule,
    MemoryModule,
    BillingModule,
    ApprovalModule,
    CompanyRuntimePreferenceModule,
  ],
  controllers: [CompanySpaceRpcController],
  providers: [CompanySpaceService],
})
export class CompanySpaceModule {}
