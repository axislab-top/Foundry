import { MigrationInterface, QueryRunner } from 'typeorm';

export class SkillExecutionLogsAndOrgNodeSkills1767874002000 implements MigrationInterface {
  name = 'SkillExecutionLogsAndOrgNodeSkills1767874002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_execution_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        skill_id UUID NULL REFERENCES skills(id) ON DELETE SET NULL,
        skill_name VARCHAR(255) NOT NULL,
        trace_id VARCHAR(64) NULL,
        args_summary JSONB NULL,
        result_summary JSONB NULL,
        duration_ms INT NULL,
        billing_units NUMERIC(12, 4) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_exec_company_created
      ON skill_execution_logs(company_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_exec_agent ON skill_execution_logs(company_id, agent_id)
    `);

    await queryRunner.query(`
      ALTER TABLE skill_execution_logs ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skill_execution_logs FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_skill_execution_logs ON skill_execution_logs
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_skill_execution_logs ON skill_execution_logs
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_node_skills (
        organization_node_id UUID NOT NULL REFERENCES organization_nodes(id) ON DELETE CASCADE,
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (organization_node_id, skill_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_node_skills_company ON organization_node_skills(company_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_node_skills_skill ON organization_node_skills(skill_id)
    `);

    await queryRunner.query(`
      ALTER TABLE organization_node_skills ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE organization_node_skills FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_org_node_skills ON organization_node_skills
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_org_node_skills ON organization_node_skills
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_org_node_skills ON organization_node_skills
    `);
    await queryRunner.query(`
      ALTER TABLE organization_node_skills NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE organization_node_skills DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS organization_node_skills`);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_skill_execution_logs ON skill_execution_logs
    `);
    await queryRunner.query(`
      ALTER TABLE skill_execution_logs NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skill_execution_logs DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS skill_execution_logs`);
  }
}
