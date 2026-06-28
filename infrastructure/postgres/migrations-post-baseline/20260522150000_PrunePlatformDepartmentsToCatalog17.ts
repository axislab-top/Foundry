import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 已废弃：不再强制 platform_departments 与契约 17 条目录对齐；由 Admin 管理。
 */
export class PrunePlatformDepartmentsToCatalog1720260522150000 implements MigrationInterface {
  name = 'PrunePlatformDepartmentsToCatalog1720260522150000';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (superseded by Admin-managed platform_departments)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
