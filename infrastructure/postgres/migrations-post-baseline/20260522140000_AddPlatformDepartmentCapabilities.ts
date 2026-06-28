import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 平台部门模板：职能摘要与任务类型标签（编排 L2 匹配；公司节点 metadata 可覆盖）。
 */
export class AddPlatformDepartmentCapabilities20260522140000 implements MigrationInterface {
  name = 'AddPlatformDepartmentCapabilities20260522140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_departments
        ADD COLUMN IF NOT EXISTS responsibility_summary text,
        ADD COLUMN IF NOT EXISTS task_type_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS excludes_task_type_tags jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_departments
        DROP COLUMN IF EXISTS responsibility_summary,
        DROP COLUMN IF EXISTS task_type_tags,
        DROP COLUMN IF EXISTS excludes_task_type_tags
    `);
  }
}
