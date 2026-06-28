import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMcpToolsAndVersions1776300000000 implements MigrationInterface {
  name = 'CreateMcpToolsAndVersions1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mcp_tools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        display_name VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        input_schema JSONB NOT NULL,
        output_schema JSONB NULL,
        security_profile VARCHAR(24) NOT NULL,
        runner_command TEXT NULL,
        required_permissions JSONB NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT false,
        version INT NOT NULL DEFAULT 1,
        approval_request_id UUID NULL REFERENCES approval_requests(id) ON DELETE SET NULL,
        approval_status VARCHAR(16) NOT NULL DEFAULT 'none',
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, name)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_tools_company_enabled ON mcp_tools(company_id, is_enabled)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_tools_name ON mcp_tools(name)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mcp_tool_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tool_id UUID NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        version INT NOT NULL,
        snapshot JSONB NOT NULL,
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tool_id, version)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_tool_versions_tool ON mcp_tool_versions(tool_id, version DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE mcp_tools ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE mcp_tool_versions ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE mcp_tools FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE mcp_tool_versions FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_mcp_tools ON mcp_tools
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_mcp_tools ON mcp_tools
      USING (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_mcp_tool_versions ON mcp_tool_versions
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_mcp_tool_versions ON mcp_tool_versions
      USING (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NULL OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_mcp_tool_versions ON mcp_tool_versions`);
    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_mcp_tools ON mcp_tools`);
    await queryRunner.query(`ALTER TABLE mcp_tool_versions NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE mcp_tools NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE mcp_tool_versions DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE mcp_tools DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP TABLE IF EXISTS mcp_tool_versions`);
    await queryRunner.query(`DROP TABLE IF EXISTS mcp_tools`);
  }
}
