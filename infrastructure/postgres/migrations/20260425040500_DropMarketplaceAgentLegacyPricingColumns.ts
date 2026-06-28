import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropMarketplaceAgentLegacyPricingColumns20260425040500 implements MigrationInterface {
  name = 'DropMarketplaceAgentLegacyPricingColumns20260425040500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP CONSTRAINT IF EXISTS chk_marketplace_agents_pricing
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS subscription_interval
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS price_cents
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS pricing_model
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(32) NOT NULL DEFAULT 'free'
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS subscription_interval VARCHAR(32)
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP CONSTRAINT IF EXISTS chk_marketplace_agents_pricing
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD CONSTRAINT chk_marketplace_agents_pricing CHECK (
        pricing_model IN ('free', 'one_time', 'subscription')
      )
    `);
  }
}
