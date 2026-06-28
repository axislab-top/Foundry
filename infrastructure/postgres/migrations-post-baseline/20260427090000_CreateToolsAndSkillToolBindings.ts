import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan A: split Tool / MCPTool out of Skill.
 *
 * - Tools are first-class records (tools + tool_versions).
 * - Skill↔Tool bindings become a real table (skill_tool_bindings) with ordering & overrides.
 * - Skill↔MCPTool bindings gain ordering & overrides (skill_mcp_tool_bindings).
 *
 * NOTE: This migration intentionally does NOT backfill/convert legacy skill.metadata bindings.
 */
export class CreateToolsAndSkillToolBindings20260427090000 implements MigrationInterface {
  name = 'CreateToolsAndSkillToolBindings20260427090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tools
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        display_name VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        implementation_type VARCHAR(32) NOT NULL DEFAULT 'builtin',
        handler_config JSONB NULL,
        input_schema JSONB NOT NULL,
        output_schema JSONB NULL,
        security_profile VARCHAR(24) NOT NULL DEFAULT 'safe',
        required_permissions JSONB NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT false,
        version INT NOT NULL DEFAULT 1,
        semver_version VARCHAR(64) NOT NULL DEFAULT '1.0.0',
        approval_request_id UUID NULL REFERENCES approval_requests(id) ON DELETE SET NULL,
        approval_status VARCHAR(16) NOT NULL DEFAULT 'none',
        change_reason TEXT NULL,
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, name)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tools_company_enabled ON tools(company_id, is_enabled)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tool_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        version INT NOT NULL,
        snapshot JSONB NOT NULL,
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tool_id, version)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tool_versions_tool ON tool_versions(tool_id, version DESC)
    `);

    // Skill↔Tool bindings (ordering + overrides)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_tool_bindings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
        position INT NOT NULL DEFAULT 0,
        is_overridden BOOLEAN NOT NULL DEFAULT false,
        config_override JSONB NULL,
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(skill_id, tool_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_tool_bindings_company_skill ON skill_tool_bindings(company_id, skill_id, position)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_tool_bindings_tool ON skill_tool_bindings(tool_id)
    `);

    // Enhance skill_mcp_tool_bindings: position/override/config
    await queryRunner.query(`
      ALTER TABLE skill_mcp_tool_bindings
        ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE skill_mcp_tool_bindings
        ADD COLUMN IF NOT EXISTS is_overridden BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE skill_mcp_tool_bindings
        ADD COLUMN IF NOT EXISTS config_override JSONB NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_mcp_tool_bindings_company_skill_position
      ON skill_mcp_tool_bindings(company_id, skill_id, position)
    `);

    // RLS: tools + tool_versions + skill_tool_bindings
    await queryRunner.query(`ALTER TABLE tools ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE tool_versions ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_tool_bindings ENABLE ROW LEVEL SECURITY`);

    await queryRunner.query(`ALTER TABLE tools FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE tool_versions FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_tool_bindings FORCE ROW LEVEL SECURITY`);

    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_tools ON tools`);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_tools ON tools
      USING (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_tool_versions ON tool_versions`);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_tool_versions ON tool_versions
      USING (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_skill_tool_bindings ON skill_tool_bindings`);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_skill_tool_bindings ON skill_tool_bindings
      USING (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Policies
    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_skill_tool_bindings ON skill_tool_bindings`);
    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_tool_versions ON tool_versions`);
    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_tools ON tools`);

    // RLS
    await queryRunner.query(`ALTER TABLE skill_tool_bindings NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE tool_versions NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE tools NO FORCE ROW LEVEL SECURITY`);

    await queryRunner.query(`ALTER TABLE skill_tool_bindings DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE tool_versions DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE tools DISABLE ROW LEVEL SECURITY`);

    // Revert skill_mcp_tool_bindings enhancement
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skill_mcp_tool_bindings_company_skill_position`);
    await queryRunner.query(`ALTER TABLE skill_mcp_tool_bindings DROP COLUMN IF EXISTS config_override`);
    await queryRunner.query(`ALTER TABLE skill_mcp_tool_bindings DROP COLUMN IF EXISTS is_overridden`);
    await queryRunner.query(`ALTER TABLE skill_mcp_tool_bindings DROP COLUMN IF EXISTS position`);

    // Drop new tables
    await queryRunner.query(`DROP TABLE IF EXISTS skill_tool_bindings`);
    await queryRunner.query(`DROP TABLE IF EXISTS tool_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS tools`);
  }
}

