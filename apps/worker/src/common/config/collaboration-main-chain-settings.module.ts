import { Module } from '@nestjs/common';
import { MessagingModule } from '@service/messaging';
import { WorkerApiRpcModule } from '../rpc/worker-api-rpc.module.js';
import { CollaborationMainChainSettingsOverlayService } from './collaboration-main-chain-settings-overlay.service.js';
import { CollaborationMainChainSettingsListener } from './collaboration-main-chain-settings.listener.js';

/**
 * 平台协作主链运行时配置 overlay（Admin MQ + RPC）。
 * 独立于 ConfigModule：overlay 依赖 `API_RPC_CLIENT`（WorkerApiRpcModule），不可与 ConfigModule 同模块注册。
 */
@Module({
  imports: [MessagingModule, WorkerApiRpcModule],
  providers: [CollaborationMainChainSettingsOverlayService, CollaborationMainChainSettingsListener],
  exports: [CollaborationMainChainSettingsOverlayService],
})
export class CollaborationMainChainSettingsModule {}
