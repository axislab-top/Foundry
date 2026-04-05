import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BillingModule：预算、消耗明细、模型单价、路由策略；company_id RLS。
 */
export class AddBillingModuleTables1767880000000 implements MigrationInterface {
  name = 'AddBillingModuleTables1767880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_settings (
        company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        routing_policy JSONB NOT NULL DEFAULT '{}',
        degrade_threshold_pct SMALLINT NOT NULL DEFAULT 80 CHECK (degrade_threshold_pct >= 0 AND degrade_threshold_pct <= 100),
        fallback_model VARCHAR(120),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        scope VARCHAR(32) NOT NULL DEFAULT 'company',
        department_id UUID,
        agent_id UUID,
        period VARCHAR(32) NOT NULL DEFAULT 'monthly',
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        total_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
        used_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
        warning_threshold NUMERIC(5, 4) NOT NULL DEFAULT 0.8 CHECK (warning_threshold >= 0 AND warning_threshold <= 1),
        period_start TIMESTAMP,
        period_end TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_budgets_scope CHECK (
          scope IN ('company', 'department', 'agent')
        ),
        CONSTRAINT chk_budgets_period CHECK (
          period IN ('none', 'monthly', 'quarterly')
        ),
        CONSTRAINT chk_budgets_used_non_negative CHECK (used_amount >= 0),
        CONSTRAINT chk_budgets_total_positive CHECK (total_amount >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_company_scope
      ON budgets(company_id)
      WHERE scope = 'company'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_company_department
      ON budgets(company_id, department_id)
      WHERE scope = 'department' AND department_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_company_agent
      ON budgets(company_id, agent_id)
      WHERE scope = 'agent' AND agent_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_budgets_company_scope
      ON budgets(company_id, scope)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS model_pricing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        model_name VARCHAR(120) NOT NULL,
        input_price_per_million NUMERIC(18, 6) NOT NULL DEFAULT 0,
        output_price_per_million NUMERIC(18, 6) NOT NULL DEFAULT 0,
        embedding_price_per_million NUMERIC(18, 6) NOT NULL DEFAULT 0,
        skill_base_fee NUMERIC(18, 6) NOT NULL DEFAULT 0,
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        effective_to TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_model_pricing_company_model
      ON model_pricing(company_id, model_name, effective_from DESC)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_model_pricing_platform_model_effective
      ON model_pricing(model_name, effective_from)
      WHERE company_id IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        department_id UUID,
        agent_id UUID,
        task_id UUID,
        skill_id UUID,
        record_type VARCHAR(32) NOT NULL,
        model_name VARCHAR(120),
        input_tokens INT NOT NULL DEFAULT 0,
        output_tokens INT NOT NULL DEFAULT 0,
        skill_call_units NUMERIC(12, 4) NOT NULL DEFAULT 0,
        cost NUMERIC(18, 6) NOT NULL DEFAULT 0,
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        idempotency_key VARCHAR(128),
        metadata JSONB,
        occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_billing_records_type CHECK (
          record_type IN ('llm', 'skill', 'embedding', 'summary', 'other')
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_records_company_idempotency
      ON billing_records(company_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_records_company_occurred
      ON billing_records(company_id, occurred_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_records_company_agent
      ON billing_records(company_id, agent_id, occurred_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_records_company_task
      ON billing_records(company_id, task_id)
    `);

    await queryRunner.query(`
      INSERT INTO model_pricing (company_id, model_name, input_price_per_million, output_price_per_million, embedding_price_per_million, skill_base_fee, currency, effective_from)
      SELECT NULL, v.model_name, v.in_p, v.out_p, v.emb_p, 0, 'USD', CURRENT_TIMESTAMP
      FROM (VALUES
        ('gpt-4o', 5.0::numeric, 15.0::numeric, 0.13::numeric),
        ('gpt-4o-mini', 0.15::numeric, 0.6::numeric, 0.02::numeric),
        ('claude-3-5-sonnet-20241022', 3.0::numeric, 15.0::numeric, 0::numeric),
        ('deepseek-chat', 0.14::numeric, 0.28::numeric, 0::numeric)
      ) AS v(model_name, in_p, out_p, emb_p)
      WHERE NOT EXISTS (
        SELECT 1 FROM model_pricing mp
        WHERE mp.company_id IS NULL AND mp.model_name = v.model_name
      )
    `);

    for (const table of ['billing_settings', 'budgets', 'billing_records']) {
      await queryRunner.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY
      `);
      await queryRunner.query(`
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY
      `);
      await queryRunner.query(`
        DROP POLICY IF EXISTS company_isolation_on_${table} ON ${table}
      `);
      await queryRunner.query(`
        CREATE POLICY company_isolation_on_${table} ON ${table}
        USING (company_id = current_setting('app.current_tenant', true)::uuid)
        WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
      `);
    }

    await queryRunner.query(`
      ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE model_pricing FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_model_pricing ON model_pricing
    `);
    await queryRunner.query(`
      CREATE POLICY model_pricing_select ON model_pricing
      FOR SELECT
      USING (
        company_id IS NULL
        OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
    await queryRunner.query(`
      CREATE POLICY model_pricing_insert ON model_pricing
      FOR INSERT
      WITH CHECK (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
    await queryRunner.query(`
      CREATE POLICY model_pricing_update ON model_pricing
      FOR UPDATE
      USING (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
    await queryRunner.query(`
      CREATE POLICY model_pricing_delete ON model_pricing
      FOR DELETE
      USING (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS billing_records`);
    await queryRunner.query(`DROP TABLE IF EXISTS model_pricing`);
    await queryRunner.query(`DROP TABLE IF EXISTS budgets`);
    await queryRunner.query(`DROP TABLE IF EXISTS billing_settings`);
  }
}
