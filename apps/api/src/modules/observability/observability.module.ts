import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@service/tenant';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { TaskRun } from '../tasks/entities/task-run.entity.js';
import { MemoryModule } from '../memory/memory.module.js';
import { ClickhouseTraceService } from './clickhouse-trace.service.js';
import { ObservabilityRpcController } from './observability.rpc.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskRun, CompanyMembership]),
    TenantModule,
    // P10/P11 对齐：让 CEO Layer Breakdown 可注入 Graph 查询能力（不强制启用）
    MemoryModule,
  ],
  controllers: [ObservabilityRpcController],
  providers: [ClickhouseTraceService],
  // Re-export MemoryModule so upstream modules can access MemoryGraphService through module boundary.
  exports: [ClickhouseTraceService, MemoryModule],
})
export class ObservabilityModule {}
