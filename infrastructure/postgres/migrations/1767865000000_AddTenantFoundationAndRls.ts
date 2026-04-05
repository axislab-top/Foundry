import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantFoundationAndRls1767865000000
  implements MigrationInterface
{
  name = 'AddTenantFoundationAndRls1767865000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        industry VARCHAR(120),
        scale VARCHAR(64),
        goal TEXT,
        initial_budget NUMERIC(18, 2),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_companies_created_by ON companies(created_by)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(64) NOT NULL DEFAULT 'member',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, user_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_memberships_company_id
      ON company_memberships(company_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_memberships_user_id
      ON company_memberships(user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_memberships_active
      ON company_memberships(company_id, user_id, is_active)
    `);

    await queryRunner.query(`
      ALTER TABLE companies ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_memberships ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE companies FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_memberships FORCE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_companies ON companies
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_companies ON companies
      USING (
        id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_memberships ON company_memberships
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_memberships ON company_memberships
      USING (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE companies IS '公司（租户）基础信息表'
    `);
    await queryRunner.query(`
      COMMENT ON TABLE company_memberships IS '用户与公司的成员关系表'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_memberships ON company_memberships
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_companies ON companies
    `);

    await queryRunner.query(`
      ALTER TABLE company_memberships NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE companies NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_memberships DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE companies DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS company_memberships
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS companies
    `);
  }
}
