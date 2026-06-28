import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 已废弃：原 up() 会批量清除 is_default_for_new_company 标记。
 * 默认部门仅由 Admin「Default for new company」管理，迁移不再改 platform_departments 数据。
 */
export class ClearLegacySystemPresetPlatformDepartmentDefaults20260525180000 implements MigrationInterface {
  name = 'ClearLegacySystemPresetPlatformDepartmentDefaults20260525180000';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (superseded — Admin-managed platform_departments)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
