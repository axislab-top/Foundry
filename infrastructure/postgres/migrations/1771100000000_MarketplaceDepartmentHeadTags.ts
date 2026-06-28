import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace department head tagging:
 * - marketplace_agents.is_department_head: whether this agent can be hired as a department head (director)
 * - marketplace_agents.department_roles: department role tags for matching (e.g. ['marketing','engineering'] or Chinese names)
 */
export class MarketplaceDepartmentHeadTags1771100000000 implements MigrationInterface {
  name = 'MarketplaceDepartmentHeadTags1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS is_department_head BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS department_roles TEXT[] NOT NULL DEFAULT '{}'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_is_department_head_published
      ON marketplace_agents(is_published, is_department_head)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS gin_marketplace_agents_department_roles
      ON marketplace_agents
      USING GIN (department_roles)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS gin_marketplace_agents_department_roles
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_marketplace_agents_is_department_head_published
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agents DROP COLUMN IF EXISTS department_roles
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agents DROP COLUMN IF EXISTS is_department_head
    `);
  }
}

