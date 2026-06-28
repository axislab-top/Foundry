import { MigrationInterface, QueryRunner } from 'typeorm';

/** Legacy migrations path — same schema as post-baseline CreateCompanyHeartbeatConfigs */
export class CreateCompanyHeartbeatConfigs1777100000000 implements MigrationInterface {
  name = 'CreateCompanyHeartbeatConfigs1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_heartbeat_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT true,
        frequency VARCHAR(16) NOT NULL DEFAULT 'daily',
        last_executed_at TIMESTAMPTZ NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_company_heartbeat_frequency CHECK (
          frequency IN ('hourly', 'daily', 'weekly')
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_heartbeat_configs_company_id
      ON company_heartbeat_configs(company_id)
    `);
    await queryRunner.query(`
      ALTER TABLE company_heartbeat_configs ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_heartbeat_configs FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_heartbeat_configs
      ON company_heartbeat_configs
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_company_heartbeat_configs
      ON company_heartbeat_configs
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_heartbeat_configs
      ON company_heartbeat_configs
    `);
    await queryRunner.query(`ALTER TABLE company_heartbeat_configs NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE company_heartbeat_configs DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP TABLE IF EXISTS company_heartbeat_configs`);
  }
}
