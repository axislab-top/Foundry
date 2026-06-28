import { Module } from '@nestjs/common';
import { ApiRunnerRpcModule } from '../../common/runner/api-runner-rpc.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { PlatformOpsRpcController } from './platform-ops.rpc.controller.js';
import { PlatformOpsService } from './platform-ops.service.js';

@Module({
  imports: [ApiRunnerRpcModule, BillingModule],
  controllers: [PlatformOpsRpcController],
  providers: [PlatformOpsService],
})
export class PlatformOpsModule {}
