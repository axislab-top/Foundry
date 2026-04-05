import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { TenantContextService } from './tenant-context.service.js';
import { SQL_SET_SESSION_CURRENT_TENANT } from '../constants/tenant.constants.js';

@Injectable()
export class TenantTypeormContextBootstrapper implements OnModuleInit {
  private readonly logger = new Logger(TenantTypeormContextBootstrapper.name);
  private patched = false;

  constructor(
    @Optional() @InjectDataSource() private readonly dataSource: DataSource | undefined,
    private readonly tenantContext: TenantContextService,
  ) {}

  onModuleInit(): void {
    if (!this.dataSource || this.patched) {
      return;
    }

    const originalCreateQueryRunner =
      this.dataSource.createQueryRunner.bind(this.dataSource);

    this.dataSource.createQueryRunner = (...args: any[]): QueryRunner => {
      const queryRunner = originalCreateQueryRunner(...args);
      this.patchQueryRunnerConnect(queryRunner);
      return queryRunner;
    };

    this.patched = true;
    this.logger.log('TypeORM tenant context bootstrapper enabled');
  }

  private patchQueryRunnerConnect(queryRunner: QueryRunner): void {
    const current = queryRunner as QueryRunner & { __tenantConnectPatched?: boolean };
    if (current.__tenantConnectPatched) {
      return;
    }

    const originalConnect = queryRunner.connect.bind(queryRunner);
    queryRunner.connect = async () => {
      await originalConnect();
      const companyId = this.tenantContext.getCompanyId();
      if (!companyId) {
        return;
      }
      await queryRunner.query(SQL_SET_SESSION_CURRENT_TENANT, [companyId]);
    };
    current.__tenantConnectPatched = true;
  }
}
