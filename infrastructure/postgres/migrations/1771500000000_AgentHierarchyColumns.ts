import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentHierarchyColumns1771500000000 implements MigrationInterface {
  name = 'AgentHierarchyColumns1771500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS reports_to_agent_id UUID NULL
    `);
    await queryRunner.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS hierarchy_version INTEGER NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_company_reports_to
      ON agents(company_id, reports_to_agent_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_company_hierarchy_version
      ON agents(company_id, hierarchy_version)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agents_company_hierarchy_version
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agents_company_reports_to
    `);
    await queryRunner.query(`
      ALTER TABLE agents DROP COLUMN IF EXISTS hierarchy_version
    `);
    await queryRunner.query(`
      ALTER TABLE agents DROP COLUMN IF EXISTS reports_to_agent_id
    `);
  }
}
