import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RpcModule } from '../../common/rpc/rpc.module.js';
import { CollaborationGateway } from './collaboration.gateway.js';
import { CollaborationNotifySubscriber } from './collaboration-notify.subscriber.js';
import { AdminNotifyModule } from '../admin-notify/admin-notify.module.js';

@Module({
  imports: [AuthModule, RpcModule, AdminNotifyModule],
  providers: [CollaborationGateway, CollaborationNotifySubscriber],
  exports: [CollaborationGateway],
})
export class CollaborationWsModule {}
