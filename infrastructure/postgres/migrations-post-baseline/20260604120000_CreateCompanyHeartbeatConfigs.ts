import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * company_heartbeat_configs：Director fan-out 开关/周期及共享 metadata（CEO 决策模型等）。
 * API: companies.heartbeat.getConfig / updateConfig
 */
export class CreateCompanyHeartbeatConfigs20260604120000 implements MigrationInterface {
  name = 'CreateCompanyHeartbeatConfigs20260604120000';

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
      COMMENT ON TABLE company_heartbeat_configs IS
        'Company heartbeat config: director fan-out enabled/frequency and shared metadata'
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
    await queryRunner.query(`
      ALTER TABLE company_heartbeat_configs NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_heartbeat_configs DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS company_heartbeat_configs
    `);
  }
}
