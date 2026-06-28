import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 充值订单（人工审批）+ 入账审计行；company_id RLS，与 billing 模块一致。
 */
export class BillingRechargeOrdersAndCredits1776800000000 implements MigrationInterface {
  name = 'BillingRechargeOrdersAndCredits1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_recharge_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        status VARCHAR(24) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        idempotency_key VARCHAR(128),
        apply_note TEXT,
        reject_reason TEXT,
        requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_recharge_orders_company_idempotency
      ON billing_recharge_orders(company_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_recharge_orders_company_status
      ON billing_recharge_orders(company_id, status, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_balance_credits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL UNIQUE REFERENCES billing_recharge_orders(id) ON DELETE RESTRICT,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE RESTRICT,
        amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        budget_total_after NUMERIC(18, 4) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_balance_credits_company_created
      ON billing_balance_credits(company_id, created_at DESC)
    `);

    for (const table of ['billing_recharge_orders', 'billing_balance_credits']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_${table} ON ${table}`);
      await queryRunner.query(`
        CREATE POLICY company_isolation_on_${table} ON ${table}
        USING (company_id = current_setting('app.current_tenant', true)::uuid)
        WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS billing_balance_credits`);
    await queryRunner.query(`DROP TABLE IF EXISTS billing_recharge_orders`);
  }
}
