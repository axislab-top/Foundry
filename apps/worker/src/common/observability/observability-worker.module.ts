import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { WorkerExecutionLogService } from './worker-execution-log.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [WorkerExecutionLogService],
  exports: [WorkerExecutionLogService],
})
export class ObservabilityWorkerModule {}
