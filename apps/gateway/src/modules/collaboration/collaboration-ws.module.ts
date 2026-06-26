import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RpcModule } from '../../common/rpc/rpc.module.js';
import { CollaborationGateway } from './collaboration.gateway.js';
import { CollaborationNotifySubscriber } from './collaboration-notify.subscriber.js';
import { AdminNotifyModule } from '../admin-notify/admin-notify.module.js';
import { TenantModule } from '@service/tenant';
import { WsTenantGuard } from '../../common/guards/ws-tenant.guard.js';

@Module({
  imports: [AuthModule, RpcModule, AdminNotifyModule, TenantModule],
  providers: [
    CollaborationGateway,
    CollaborationNotifySubscriber,
    WsTenantGuard,
  ],
  exports: [CollaborationGateway],
})
export class CollaborationWsModule {}
