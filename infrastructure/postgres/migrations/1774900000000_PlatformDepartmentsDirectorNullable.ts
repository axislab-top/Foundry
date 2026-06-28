import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 平台部门允许先无总监（director_marketplace_agent_id 可空）。
 * - 放宽 NOT NULL
 * - FK 改为 ON DELETE SET NULL（与早期迁移 down 一致）
 * - 保留 UNIQUE：仍保证 1:1（同时允许多个 NULL）
 */
export class PlatformDepartmentsDirectorNullable1774900000000 implements MigrationInterface {
  name = 'PlatformDepartmentsDirectorNullable1774900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_departments
        ALTER COLUMN director_marketplace_agent_id DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE platform_departments DROP CONSTRAINT IF EXISTS fk_platform_departments_director_agent
    `);
    await queryRunner.query(`
      ALTER TABLE platform_departments DROP CONSTRAINT IF EXISTS fk_platform_departments_director_agent_set_null
    `);
    await queryRunner.query(`
      ALTER TABLE platform_departments
        ADD CONSTRAINT fk_platform_departments_director_agent_set_null
        FOREIGN KEY (director_marketplace_agent_id) REFERENCES marketplace_agents(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_departments DROP CONSTRAINT IF EXISTS fk_platform_departments_director_agent_set_null
    `);
    await queryRunner.query(`
      ALTER TABLE platform_departments
        ADD CONSTRAINT fk_platform_departments_director_agent
        FOREIGN KEY (director_marketplace_agent_id) REFERENCES marketplace_agents(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE platform_departments
        ALTER COLUMN director_marketplace_agent_id SET NOT NULL
    `);
  }
}

