import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { SQL_SET_LOCAL_CURRENT_TENANT } from '../constants/tenant.constants.js';

@Injectable()
export class TenantRlsService {
  async setLocalTenant(queryRunner: QueryRunner, companyId: string): Promise<void> {
    await queryRunner.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
  }

  async withTenantTransaction<T>(
    dataSource: DataSource,
    companyId: string,
    operation: (manager: EntityManager, queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.setLocalTenant(queryRunner, companyId);
      const result = await operation(queryRunner.manager, queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
