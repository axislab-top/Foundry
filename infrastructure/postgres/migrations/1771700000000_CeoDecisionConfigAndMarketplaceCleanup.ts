import { MigrationInterface, QueryRunner } from 'typeorm';

export class CeoDecisionConfigAndMarketplaceCleanup1771700000000 implements MigrationInterface {
  name = 'CeoDecisionConfigAndMarketplaceCleanup1771700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS ceo_decision_model VARCHAR(120) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE billing_settings
      ADD COLUMN IF NOT EXISTS ceo_decision_llm_key_id UUID NULL
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS company_marketplace_agent_decision_key_assignments
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS marketplace_agent_decision_key_bindings
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS decision_bound_model_name
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS decision_bound_model_name VARCHAR(120) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE billing_settings
      DROP COLUMN IF EXISTS ceo_decision_llm_key_id
    `);
  }
}
