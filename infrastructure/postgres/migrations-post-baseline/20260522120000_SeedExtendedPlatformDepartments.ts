import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 已废弃：平台部门改由 Admin 管理系统创建，不再通过迁移 seed 17 条目录。
 */
export class SeedExtendedPlatformDepartments20260522120000 implements MigrationInterface {
  name = 'SeedExtendedPlatformDepartments20260522120000';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (superseded by Admin-managed platform_departments)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
