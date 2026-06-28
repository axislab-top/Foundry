import { Module } from '@nestjs/common';
import { ConfigModule } from '../../common/config/config.module.js';
import { WorkerApiRpcModule } from '../../common/rpc/worker-api-rpc.module.js';
import { FileAssetsRegistrationService } from './file-assets-registration.service.js';

@Module({
  imports: [ConfigModule, WorkerApiRpcModule],
  providers: [FileAssetsRegistrationService],
  exports: [FileAssetsRegistrationService],
})
export class FileAssetsWorkerModule {}
