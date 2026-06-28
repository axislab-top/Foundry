import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketplaceAgentEmployeeTokenPricing20260425035000 implements MigrationInterface {
  name = 'MarketplaceAgentEmployeeTokenPricing20260425035000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS employee_input_price_per_1k NUMERIC(12,6) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS employee_output_price_per_1k NUMERIC(12,6) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD CONSTRAINT chk_marketplace_agents_employee_input_price_per_1k_non_negative
      CHECK (employee_input_price_per_1k >= 0)
    `).catch(() => undefined);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD CONSTRAINT chk_marketplace_agents_employee_output_price_per_1k_non_negative
      CHECK (employee_output_price_per_1k >= 0)
    `).catch(() => undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP CONSTRAINT IF EXISTS chk_marketplace_agents_employee_output_price_per_1k_non_negative
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP CONSTRAINT IF EXISTS chk_marketplace_agents_employee_input_price_per_1k_non_negative
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS employee_output_price_per_1k
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS employee_input_price_per_1k
    `);
  }
}
