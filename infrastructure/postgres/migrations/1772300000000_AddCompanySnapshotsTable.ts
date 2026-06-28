import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Company runtime snapshots for heartbeat state persistence.
 */
export class AddCompanySnapshotsTable1772300000000 implements MigrationInterface {
  name = 'AddCompanySnapshotsTable1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        version BIGINT NOT NULL,
        snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_company_snapshots_company_version UNIQUE (company_id, version)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_snapshots_company_created_at
      ON company_snapshots(company_id, created_at DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE company_snapshots ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_snapshots FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_snapshots ON company_snapshots
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_company_snapshots ON company_snapshots
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_snapshots ON company_snapshots
    `);
    await queryRunner.query(`
      ALTER TABLE company_snapshots NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_snapshots DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_company_snapshots_company_created_at
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS company_snapshots
    `);
  }
}
