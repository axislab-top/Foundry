import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 历史：曾 DELETE 无总监的 platform_departments 行并强制 NOT NULL。
 * 现由 1774900000000_PlatformDepartmentsDirectorNullable 允许无总监；本迁移仅保留兼容已执行库，不再删数据。
 * 平台部门 / 主管 / 员工均通过 Admin 或 apps/api/scripts/* 维护，勿在迁移中 seed。
 */
export class PlatformDepartmentsDirectorNotNull1774700000000 implements MigrationInterface {
  name = 'PlatformDepartmentsDirectorNotNull1774700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 不再 DELETE 无总监部门（Admin 可先建部门后绑总监）

    await queryRunner.query(`
      DO $$
      DECLARE cname text;
      BEGIN
        SELECT tc.constraint_name INTO cname
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'platform_departments'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'director_marketplace_agent_id'
        LIMIT 1;
        IF cname IS NOT NULL AND cname <> 'fk_platform_departments_director_agent_set_null' THEN
          EXECUTE format('ALTER TABLE platform_departments DROP CONSTRAINT %I', cname);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_platform_departments_director_agent'
        ) THEN
          ALTER TABLE platform_departments
            ADD CONSTRAINT fk_platform_departments_director_agent
            FOREIGN KEY (director_marketplace_agent_id) REFERENCES marketplace_agents(id) ON DELETE RESTRICT;
        END IF;
      END $$
    `);

    // 不强制 SET NOT NULL：后续迁移 177490 将总监改为可空；避免与 Admin 工作流冲突
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_departments DROP CONSTRAINT IF EXISTS fk_platform_departments_director_agent
    `);
    await queryRunner.query(`
      ALTER TABLE platform_departments
        ADD CONSTRAINT fk_platform_departments_director_agent_set_null
        FOREIGN KEY (director_marketplace_agent_id) REFERENCES marketplace_agents(id) ON DELETE SET NULL
    `);
  }
}
