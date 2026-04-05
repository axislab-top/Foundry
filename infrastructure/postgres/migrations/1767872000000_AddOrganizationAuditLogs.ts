import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationAuditLogs1767872000000 implements MigrationInterface {
  name = 'AddOrganizationAuditLogs1767872000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id UUID NULL,
        node_id UUID NOT NULL REFERENCES organization_nodes(id) ON DELETE CASCADE,
        action VARCHAR(24) NOT NULL,
        before_state JSONB NULL,
        after_state JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_organization_audit_action
          CHECK (action IN ('create', 'update', 'move', 'delete'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_audit_company_created
      ON organization_audit_logs(company_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_audit_company_node
      ON organization_audit_logs(company_id, node_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_audit_company_user
      ON organization_audit_logs(company_id, user_id)
    `);

    await queryRunner.query(`
      ALTER TABLE organization_audit_logs ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE organization_audit_logs FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_organization_audit_logs ON organization_audit_logs
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_organization_audit_logs ON organization_audit_logs
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
      DROP POLICY IF EXISTS company_isolation_on_organization_audit_logs ON organization_audit_logs
    `);
    await queryRunner.query(`
      ALTER TABLE organization_audit_logs NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE organization_audit_logs DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS organization_audit_logs
    `);
  }
}
