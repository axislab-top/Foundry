import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 已废弃：平台部门改由 Admin 管理系统创建，不再通过迁移 seed。
 */
export class SeedDefaultPlatformDepartments20260428110800 implements MigrationInterface {
  name = 'SeedDefaultPlatformDepartments20260428110800';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (superseded by Admin-managed platform_departments)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
