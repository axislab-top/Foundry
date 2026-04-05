import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationNodes1767871000000 implements MigrationInterface {
  name = 'AddOrganizationNodes1767871000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_nodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        parent_id UUID NULL REFERENCES organization_nodes(id) ON DELETE SET NULL,
        type VARCHAR(24) NOT NULL,
        name VARCHAR(120) NOT NULL,
        description TEXT NULL,
        agent_id UUID NULL,
        order_no INT NOT NULL DEFAULT 0,
        metadata JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_organization_node_type
          CHECK (type IN ('board', 'ceo', 'department', 'agent'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_nodes_company_parent_order
      ON organization_nodes(company_id, parent_id, order_no)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_nodes_company_type
      ON organization_nodes(company_id, type)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_nodes_company_agent
      ON organization_nodes(company_id, agent_id)
    `);

    await queryRunner.query(`
      ALTER TABLE organization_nodes ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE organization_nodes FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_organization_nodes ON organization_nodes
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_organization_nodes ON organization_nodes
      USING (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_organization_nodes ON organization_nodes
    `);
    await queryRunner.query(`
      ALTER TABLE organization_nodes NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE organization_nodes DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS organization_nodes
    `);
  }
}
