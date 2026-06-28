import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 已废弃：原迁移曾批量写入系统预设默认部门。
 * 默认部门现仅由 Admin「Default for new company」开关管理。
 */
export class ApplyDefaultPlatformDepartmentsForNewCompany20260525160000 implements MigrationInterface {
  name = 'ApplyDefaultPlatformDepartmentsForNewCompany20260525160000';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (superseded)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
