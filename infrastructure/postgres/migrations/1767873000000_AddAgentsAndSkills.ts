import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentsAndSkills1767873000000 implements MigrationInterface {
  name = 'AddAgentsAndSkills1767873000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        organization_node_id UUID NULL REFERENCES organization_nodes(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(64) NOT NULL,
        expertise TEXT NULL,
        avatar_url VARCHAR(500) NULL,
        system_prompt TEXT NULL,
        llm_model VARCHAR(120) NULL,
        personality JSONB NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        human_in_loop BOOLEAN NOT NULL DEFAULT false,
        pending_config JSONB NULL,
        metadata JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_agents_status CHECK (status IN ('active', 'inactive', 'suspended')),
        CONSTRAINT chk_agents_role CHECK (role IN ('ceo', 'director', 'board_member', 'executor'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_company_id ON agents(company_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_company_role ON agents(company_id, role)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_company_status ON agents(company_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_org_node ON agents(organization_node_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_company_ceo_unique
      ON agents(company_id)
      WHERE role = 'ceo'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(120) NULL,
        tool_schema JSONB NULL,
        prompt_template TEXT NULL,
        implementation_type VARCHAR(32) NOT NULL DEFAULT 'builtin',
        permissions JSONB NULL,
        metadata JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_skills_impl_type CHECK (implementation_type IN ('builtin', 'langgraph', 'api'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skills_company_id ON skills(company_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agent_skills (
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (agent_id, skill_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_skills_company ON agent_skills(company_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agent_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id UUID NULL,
        agent_id UUID NULL REFERENCES agents(id) ON DELETE SET NULL,
        action VARCHAR(64) NOT NULL,
        before_state JSONB NULL,
        after_state JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_audit_company_created ON agent_audit_logs(company_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_audit_agent ON agent_audit_logs(company_id, agent_id)
    `);

    await queryRunner.query(`
      ALTER TABLE organization_nodes
      DROP CONSTRAINT IF EXISTS fk_organization_nodes_agent
    `);
    await queryRunner.query(`
      ALTER TABLE organization_nodes
      ADD CONSTRAINT fk_organization_nodes_agent
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_org_nodes_company_agent_unique
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_org_nodes_company_agent_unique
      ON organization_nodes(company_id, agent_id)
      WHERE agent_id IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE agents ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE agents FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_agents ON agents
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_agents ON agents
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE skills ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skills FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS tenant_read_global_skills ON skills
    `);
    await queryRunner.query(`
      CREATE POLICY tenant_read_global_skills ON skills
      FOR SELECT
      USING (
        company_id IS NULL
        OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS tenant_write_company_skills ON skills
    `);
    await queryRunner.query(`
      CREATE POLICY tenant_write_company_skills ON skills
      FOR ALL
      USING (
        company_id IS NOT NULL
        AND company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NOT NULL
        AND company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`
      ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE agent_skills FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_agent_skills ON agent_skills
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_agent_skills ON agent_skills
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE agent_audit_logs ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE agent_audit_logs FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_agent_audit_logs ON agent_audit_logs
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_agent_audit_logs ON agent_audit_logs
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_agent_audit_logs ON agent_audit_logs
    `);
    await queryRunner.query(`
      ALTER TABLE agent_audit_logs NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE agent_audit_logs DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_agent_skills ON agent_skills
    `);
    await queryRunner.query(`
      ALTER TABLE agent_skills NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE agent_skills DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS tenant_write_company_skills ON skills
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS tenant_read_global_skills ON skills
    `);
    await queryRunner.query(`
      ALTER TABLE skills NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE skills DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_agents ON agents
    `);
    await queryRunner.query(`
      ALTER TABLE agents NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE agents DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_org_nodes_company_agent_unique
    `);

    await queryRunner.query(`
      ALTER TABLE organization_nodes DROP CONSTRAINT IF EXISTS fk_organization_nodes_agent
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS agent_audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_skills`);
    await queryRunner.query(`DROP TABLE IF EXISTS skills`);
    await queryRunner.query(`DROP TABLE IF EXISTS agents`);
  }
}
