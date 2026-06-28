import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 平台部门：管理员定义部门列表，并与商城 Agent（总监）一对一绑定。
 */
export class CreatePlatformDepartments1774500000000 implements MigrationInterface {
  name = 'CreatePlatformDepartments1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(64) NOT NULL UNIQUE,
        display_name VARCHAR(120) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        director_marketplace_agent_id UUID UNIQUE NULL REFERENCES marketplace_agents(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_departments_sort_order
      ON platform_departments(sort_order ASC, display_name ASC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS platform_departments`);
  }
}
