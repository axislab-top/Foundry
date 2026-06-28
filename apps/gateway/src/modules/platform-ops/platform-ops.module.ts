import { Module } from '@nestjs/common';
import { PlatformOpsController } from './platform-ops.controller.js';

@Module({
  controllers: [PlatformOpsController],
})
export class PlatformOpsModule {}
