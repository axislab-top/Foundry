import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CEO 商品（slug=ceo）在 marketplace_agent_key_bindings 上按层拆分 Key 池：
 * - ceo_layer = 'default'：普通 Agent 商品（单池，行为与历史一致）
 * - ceo_layer = 'classifier' | 'light' | 'heavy'：CEO 商品每层独立池
 *
 * 保留 llm_key_id 全局唯一：一把 Key 全局只能绑定一行（跨层不可复用）。
 */
export class AddCeoLayerToMarketplaceKeyBindings1772300000000 implements MigrationInterface {
  name = 'AddCeoLayerToMarketplaceKeyBindings1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      ADD COLUMN IF NOT EXISTS ceo_layer VARCHAR(32) NOT NULL DEFAULT 'default'
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      DROP CONSTRAINT IF EXISTS uq_marketplace_agent_key_bindings_agent_key
    `);

    await queryRunner.query(`
      UPDATE marketplace_agent_key_bindings b
      SET ceo_layer = 'classifier'
      FROM marketplace_agents a
      WHERE b.marketplace_agent_id = a.id
        AND a.slug = 'ceo'
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      ADD CONSTRAINT uq_marketplace_agent_key_bindings_agent_layer_key
      UNIQUE (marketplace_agent_id, ceo_layer, llm_key_id)
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_marketplace_agent_key_bindings_agent_sort
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agent_key_bindings_agent_layer_sort
      ON marketplace_agent_key_bindings(marketplace_agent_id, ceo_layer, sort_order ASC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_marketplace_agent_key_bindings_agent_layer_sort
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      DROP CONSTRAINT IF EXISTS uq_marketplace_agent_key_bindings_agent_layer_key
    `);

    await queryRunner.query(`
      DELETE FROM marketplace_agent_key_bindings b
      USING marketplace_agents a
      WHERE b.marketplace_agent_id = a.id
        AND a.slug = 'ceo'
        AND b.ceo_layer IN ('light', 'heavy')
    `);

    await queryRunner.query(`
      UPDATE marketplace_agent_key_bindings b
      SET ceo_layer = 'default'
      FROM marketplace_agents a
      WHERE b.marketplace_agent_id = a.id
        AND a.slug = 'ceo'
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      DROP COLUMN IF EXISTS ceo_layer
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agent_key_bindings_agent_sort
      ON marketplace_agent_key_bindings(marketplace_agent_id, sort_order ASC)
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      ADD CONSTRAINT uq_marketplace_agent_key_bindings_agent_key UNIQUE (marketplace_agent_id, llm_key_id)
    `);
  }
}
