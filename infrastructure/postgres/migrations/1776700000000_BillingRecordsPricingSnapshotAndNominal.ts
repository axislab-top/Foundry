import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TB-1: LLM 计费审计 — 招聘/入账时刻价格快照 + 名义 token 标记（task.completed 等）。
 */
export class BillingRecordsPricingSnapshotAndNominal1776700000000 implements MigrationInterface {
  name = 'BillingRecordsPricingSnapshotAndNominal1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_records
        ADD COLUMN IF NOT EXISTS pricing_snapshot_json JSONB NULL,
        ADD COLUMN IF NOT EXISTS pricing_source VARCHAR(32) NULL,
        ADD COLUMN IF NOT EXISTS is_nominal BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN billing_records.pricing_snapshot_json IS '入账时刻定价快照（不可追溯改价）；缺省时可能由 model_pricing 解析结果回填';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN billing_records.pricing_source IS 'snapshot | model_pricing | explicit_cost | nominal';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN billing_records.is_nominal IS '名义消耗（如 task.completed 占位 token），报表与预算可与真实 LLM 区分';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_records_company_nominal_occurred
        ON billing_records (company_id, is_nominal, occurred_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_billing_records_company_nominal_occurred`);
    await queryRunner.query(`
      ALTER TABLE billing_records
        DROP COLUMN IF EXISTS is_nominal,
        DROP COLUMN IF EXISTS pricing_source,
        DROP COLUMN IF EXISTS pricing_snapshot_json
    `);
  }
}
