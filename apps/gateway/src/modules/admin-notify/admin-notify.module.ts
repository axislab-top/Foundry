import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminNotifyGateway } from './admin-notify.gateway.js';
import { TenantModule } from '@service/tenant';
import { WsTenantGuard } from '../../common/guards/ws-tenant.guard.js';

@Module({
  imports: [AuthModule, TenantModule],
  providers: [AdminNotifyGateway, WsTenantGuard],
  exports: [AdminNotifyGateway, WsTenantGuard],
})
export class AdminNotifyModule {}

