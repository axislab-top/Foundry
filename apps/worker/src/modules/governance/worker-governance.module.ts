import { Module } from '@nestjs/common';
import { ConfigModule } from '../../common/config/config.module.js';
import { BoardGatewayService } from '@foundry/multi-agent-core';
import { WorkerBoardGatewayService } from './worker-board-gateway.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    WorkerBoardGatewayService,
    {
      provide: BoardGatewayService,
      useExisting: WorkerBoardGatewayService,
    },
  ],
  exports: [BoardGatewayService, WorkerBoardGatewayService],
})
export class WorkerGovernanceModule {}
