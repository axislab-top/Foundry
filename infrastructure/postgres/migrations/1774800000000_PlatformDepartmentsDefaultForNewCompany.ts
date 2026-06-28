import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 平台部门：标记哪些部门为“新建公司默认启用（基础部门）”。
 * 该标记用于创建公司时的组织初始化默认部门来源（当向导未提供 placements）。
 */
export class PlatformDepartmentsDefaultForNewCompany1774800000000 implements MigrationInterface {
  name = 'PlatformDepartmentsDefaultForNewCompany1774800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_departments
      ADD COLUMN IF NOT EXISTS is_default_for_new_company BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_departments_default_for_new_company
      ON platform_departments(is_default_for_new_company)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_platform_departments_default_for_new_company
    `);
    await queryRunner.query(`
      ALTER TABLE platform_departments
      DROP COLUMN IF EXISTS is_default_for_new_company
    `);
  }
}

