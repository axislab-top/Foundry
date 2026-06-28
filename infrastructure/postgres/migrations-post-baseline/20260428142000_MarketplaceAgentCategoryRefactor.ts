import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketplaceAgentCategoryRefactor20260428142000 implements MigrationInterface {
  name = 'MarketplaceAgentCategoryRefactor20260428142000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS agent_category VARCHAR(32)
    `);

    await queryRunner.query(`
      UPDATE marketplace_agents
      SET agent_category = CASE
        WHEN slug = 'ceo' THEN 'ceo'
        WHEN is_department_head = true THEN 'department_head'
        ELSE 'employee'
      END
      WHERE agent_category IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ALTER COLUMN agent_category SET DEFAULT 'employee'
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ALTER COLUMN agent_category SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_is_published_agent_category
      ON marketplace_agents(is_published, agent_category)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_agent_category_updated_at
      ON marketplace_agents(agent_category, updated_at DESC)
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_marketplace_agents_is_department_head_published
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS is_department_head
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS is_department_head BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE marketplace_agents
      SET is_department_head = (agent_category = 'department_head')
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_is_department_head_published
      ON marketplace_agents(is_published, is_department_head)
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_marketplace_agents_agent_category_updated_at
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_marketplace_agents_is_published_agent_category
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS agent_category
    `);
  }
}
