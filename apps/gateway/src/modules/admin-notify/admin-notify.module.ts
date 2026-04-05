import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminNotifyGateway } from './admin-notify.gateway.js';

@Module({
  imports: [AuthModule],
  providers: [AdminNotifyGateway],
  exports: [AdminNotifyGateway],
})
export class AdminNotifyModule {}

