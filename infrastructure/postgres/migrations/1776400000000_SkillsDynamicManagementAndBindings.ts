import { MigrationInterface, QueryRunner } from 'typeorm';

export class SkillsDynamicManagementAndBindings1776400000000 implements MigrationInterface {
  name = 'SkillsDynamicManagementAndBindings1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS display_name VARCHAR(200) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS input_schema JSONB NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS output_schema JSONB NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS security_profile VARCHAR(24) NOT NULL DEFAULT 'safe'
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS approval_request_id UUID NULL REFERENCES approval_requests(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS approval_status VARCHAR(16) NOT NULL DEFAULT 'none'
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS change_reason TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skills_company_enabled ON skills(company_id, is_enabled)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skills_approval_status ON skills(approval_status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        version INT NOT NULL,
        snapshot JSONB NOT NULL,
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(skill_id, version)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id, version DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_mcp_tool_bindings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        mcp_tool_id UUID NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(skill_id, mcp_tool_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_mcp_bindings_company_skill ON skill_mcp_tool_bindings(company_id, skill_id)
    `);

    await queryRunner.query(`
      ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skill_mcp_tool_bindings ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skill_versions FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skill_mcp_tool_bindings FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_skill_versions ON skill_versions
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_skill_versions ON skill_versions
      USING (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_skill_mcp_tool_bindings ON skill_mcp_tool_bindings
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_skill_mcp_tool_bindings ON skill_mcp_tool_bindings
      USING (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS company_isolation_on_skill_mcp_tool_bindings ON skill_mcp_tool_bindings`,
    );
    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_skill_versions ON skill_versions`);
    await queryRunner.query(`ALTER TABLE skill_mcp_tool_bindings NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_versions NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_mcp_tool_bindings DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_versions DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP TABLE IF EXISTS skill_mcp_tool_bindings`);
    await queryRunner.query(`DROP TABLE IF EXISTS skill_versions`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_approval_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_company_enabled`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS updated_by`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS created_by`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS change_reason`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS approval_status`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS approval_request_id`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS is_enabled`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS security_profile`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS output_schema`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS input_schema`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS display_name`);
  }
}

