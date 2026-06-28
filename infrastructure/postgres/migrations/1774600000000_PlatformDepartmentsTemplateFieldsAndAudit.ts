import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 平台部门模板字段（与 @foundry/contracts PLATFORM_DEPARTMENTS 对齐）+ 绑定审计。
 * director_marketplace_agent_id 已有 UNIQUE，保证 1:1 Agent ↔ 部门总监。
 */
export class PlatformDepartmentsTemplateFieldsAndAudit1774600000000 implements MigrationInterface {
  name = 'PlatformDepartmentsTemplateFieldsAndAudit1774600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_departments
        ADD COLUMN IF NOT EXISTS category VARCHAR(32) NULL,
        ADD COLUMN IF NOT EXISTS icon VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS recommended_head_token VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS default_skills JSONB NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_department_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        platform_department_id UUID NOT NULL REFERENCES platform_departments(id) ON DELETE CASCADE,
        actor_user_id UUID NOT NULL,
        action VARCHAR(24) NOT NULL,
        previous_marketplace_agent_id UUID NULL REFERENCES marketplace_agents(id) ON DELETE SET NULL,
        new_marketplace_agent_id UUID NULL REFERENCES marketplace_agents(id) ON DELETE SET NULL,
        metadata JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_platform_dept_audit_dept
      ON platform_department_audit_logs(platform_department_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS platform_department_audit_logs`);
    await queryRunner.query(`
      ALTER TABLE platform_departments
        DROP COLUMN IF EXISTS category,
        DROP COLUMN IF EXISTS icon,
        DROP COLUMN IF EXISTS recommended_head_token,
        DROP COLUMN IF EXISTS default_skills
    `);
  }
}
