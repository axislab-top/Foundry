import { MigrationInterface, QueryRunner } from 'typeorm';

export class SkillAuditLogsTable1769100000000 implements MigrationInterface {
  name = 'SkillAuditLogsTable1769100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
        skill_id UUID NULL REFERENCES skills(id) ON DELETE SET NULL,
        skill_name VARCHAR(255) NULL,
        action_type VARCHAR(32) NOT NULL,
        changed_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        before_state JSONB NULL,
        after_state JSONB NULL,
        scan_result JSONB NULL,
        risk_level VARCHAR(16) NULL,
        review_status VARCHAR(16) NOT NULL DEFAULT 'logged',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_audit_logs_company_created
      ON skill_audit_logs(company_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_audit_logs_skill ON skill_audit_logs(skill_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_audit_logs_action ON skill_audit_logs(action_type)
    `);

    // Tenant isolation:
    // - company_id IS NULL -> platform/global records
    // - company_id = current tenant -> tenant records
    await queryRunner.query(`
      ALTER TABLE skill_audit_logs ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skill_audit_logs FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_skill_audit_logs ON skill_audit_logs
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_skill_audit_logs ON skill_audit_logs
      USING (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE skill_audit_logs IS '平台全局 Skills 审计日志'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_skill_audit_logs ON skill_audit_logs
    `);
    await queryRunner.query(`
      ALTER TABLE skill_audit_logs NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skill_audit_logs DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS skill_audit_logs
    `);
  }
}

