import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 已废弃：原 up() 按 slug 批量 DELETE，会误删 Admin 在「平台部门」中创建的行
 *（与历史 migration seed 共用 engineering/sales 等 slug 时无法区分）。
 * 平台部门现仅由 Admin 维护；不再通过迁移清理。
 */
export class RemoveMigrationSeededPlatformDepartments20260525200000 implements MigrationInterface {
  name = 'RemoveMigrationSeededPlatformDepartments20260525200000';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (superseded — do not delete platform_departments by slug)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
