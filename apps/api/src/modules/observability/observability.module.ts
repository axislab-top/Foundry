import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@service/tenant';
import { CompanyMembership } from '../companies/entities/company-membership.entity.js';
import { TaskRun } from '../tasks/entities/task-run.entity.js';
import { ClickhouseTraceService } from './clickhouse-trace.service.js';
import { ObservabilityRpcController } from './observability.rpc.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([TaskRun, CompanyMembership]), TenantModule],
  controllers: [ObservabilityRpcController],
  providers: [ClickhouseTraceService],
  exports: [ClickhouseTraceService],
})
export class ObservabilityModule {}
