import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create daily_agent_usage aggregation table and billing_settings extension columns.
 */
export class AddDailyAgentUsageAndBillingSettingsColumns20260425031100
  implements MigrationInterface
{
  name = 'AddDailyAgentUsageAndBillingSettingsColumns20260425031100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS daily_agent_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        agent_id uuid NOT NULL,
        usage_date date NOT NULL,
        input_tokens bigint NOT NULL DEFAULT 0,
        output_tokens bigint NOT NULL DEFAULT 0,
        input_cost numeric(18,6) NOT NULL DEFAULT 0,
        output_cost numeric(18,6) NOT NULL DEFAULT 0,
        total_cost numeric(18,6) NOT NULL DEFAULT 0,
        llm_model varchar(120) NULL,
        call_count int NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_agent_usage_company_agent_date
      ON daily_agent_usage (company_id, agent_id, usage_date)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_agent_usage_company_date
      ON daily_agent_usage (company_id, usage_date)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_agent_usage_date_total_cost
      ON daily_agent_usage (usage_date, total_cost DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_agent_usage_company_date_total_cost
      ON daily_agent_usage (company_id, usage_date, total_cost DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS agent_token_pricing jsonb NULL,
      ADD COLUMN IF NOT EXISTS agent_usage_aggregate_interval_minutes int NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_settings
      DROP COLUMN IF EXISTS agent_usage_aggregate_interval_minutes,
      DROP COLUMN IF EXISTS agent_token_pricing
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS daily_agent_usage
    `);
  }
}

