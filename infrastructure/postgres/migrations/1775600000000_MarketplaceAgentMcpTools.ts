import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add marketplace_agents.mcp_tools JSONB field.
 *
 * This keeps DB schema aligned with MarketplaceAgent entity and avoids
 * runtime 500s on environments that missed the original column rollout.
 */
export class MarketplaceAgentMcpTools1775600000000 implements MigrationInterface {
  name = 'MarketplaceAgentMcpTools1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS mcp_tools JSONB NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS mcp_tools
    `);
  }
}
