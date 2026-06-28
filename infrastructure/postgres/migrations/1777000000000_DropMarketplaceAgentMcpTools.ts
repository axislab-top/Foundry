import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace admin no longer stores manual MCP tool bindings.
 * Runtime MCP tools are derived from bound skills, so the legacy
 * marketplace_agents.mcp_tools column can be removed.
 */
export class DropMarketplaceAgentMcpTools1777000000000 implements MigrationInterface {
  name = 'DropMarketplaceAgentMcpTools1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS mcp_tools
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS mcp_tools JSONB NULL
    `);
  }
}
