import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 按天聚合 billing_records，并将预算扣减改为累计后周期结算。
 */
export class BillingDailyAggregationAndSettlement1776900000000 implements MigrationInterface {
  name = 'BillingDailyAggregationAndSettlement1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_records
      ADD COLUMN IF NOT EXISTS usage_date DATE
    `);
    await queryRunner.query(`
      UPDATE billing_records
      SET usage_date = (occurred_at AT TIME ZONE 'UTC')::date
      WHERE usage_date IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE billing_records
      ALTER COLUMN usage_date SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE billing_records
      DROP CONSTRAINT IF EXISTS chk_billing_records_type
    `);
    await queryRunner.query(`
      ALTER TABLE billing_records
      ADD CONSTRAINT chk_billing_records_type CHECK (
        record_type IN ('llm', 'skill', 'embedding', 'summary', 'agent_day', 'other')
      )
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_billing_records_company_idempotency
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_records_daily_agent
      ON billing_records(company_id, agent_id, usage_date, record_type, is_nominal)
      WHERE agent_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_records_company_usage_date
      ON billing_records(company_id, usage_date DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_record_idempotency (
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        idempotency_key VARCHAR(128) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (company_id, idempotency_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_record_idempotency_created
      ON billing_record_idempotency(created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_budget_accruals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        scope VARCHAR(32) NOT NULL,
        department_id UUID NULL,
        agent_id UUID NULL,
        accrued_amount NUMERIC(18, 6) NOT NULL DEFAULT 0,
        last_settled_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_billing_budget_accruals_scope CHECK (scope IN ('company', 'department', 'agent'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_budget_accruals_scope
      ON billing_budget_accruals(company_id, scope, department_id, agent_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_budget_accruals_company_amount
      ON billing_budget_accruals(company_id, accrued_amount DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE billing_record_idempotency ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE billing_record_idempotency FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_billing_record_idempotency ON billing_record_idempotency
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_billing_record_idempotency ON billing_record_idempotency
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE billing_budget_accruals ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE billing_budget_accruals FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_billing_budget_accruals ON billing_budget_accruals
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_billing_budget_accruals ON billing_budget_accruals
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_select_billing_records ON billing_records
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_insert_billing_records ON billing_records
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_select_billing_records ON billing_records
      FOR SELECT
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_insert_billing_records ON billing_records
      FOR INSERT
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_update_billing_records ON billing_records
      FOR UPDATE
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_update_billing_records ON billing_records
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS billing_budget_accruals
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS billing_record_idempotency
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_billing_records_daily_agent
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_billing_records_company_usage_date
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_records_company_idempotency
      ON billing_records(company_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE billing_records
      DROP CONSTRAINT IF EXISTS chk_billing_records_type
    `);
    await queryRunner.query(`
      ALTER TABLE billing_records
      ADD CONSTRAINT chk_billing_records_type CHECK (
        record_type IN ('llm', 'skill', 'embedding', 'summary', 'other')
      )
    `);
    await queryRunner.query(`
      ALTER TABLE billing_records
      DROP COLUMN IF EXISTS usage_date
    `);
  }
}
