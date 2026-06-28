import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Embedding 模型池 + 商城/公司分配扩展（与 LLM Key 池对称，M1）
 * - embedding_models：管理员维护的全局池
 * - marketplace_agent_key_bindings：可选 embedding_model_id + is_primary
 * - company_marketplace_agent_key_assignments：assigned_embedding_model_id
 * - agents：继承的 embedding_model_id + embedding_model（展示名）
 */
export class EmbeddingModelsPoolAndBindings1774300000000 implements MigrationInterface {
  name = 'EmbeddingModelsPoolAndBindings1774300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS embedding_models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_name VARCHAR(120) NOT NULL,
        provider VARCHAR(64) NOT NULL DEFAULT 'openai',
        dimensions INTEGER NOT NULL DEFAULT 1536,
        encrypted_secret TEXT,
        request_url VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT true,
        max_batch_size INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_embedding_models_provider_model UNIQUE (provider, model_name)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_embedding_models_active
      ON embedding_models(is_active)
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      ADD COLUMN IF NOT EXISTS embedding_model_id UUID REFERENCES embedding_models(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      ADD COLUMN IF NOT EXISTS embedding_is_primary BOOLEAN NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      ADD COLUMN IF NOT EXISTS assigned_embedding_model_id UUID REFERENCES embedding_models(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(120)
    `);
    await queryRunner.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS embedding_model_id UUID REFERENCES embedding_models(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_company_embedding_model
      ON agents(company_id, embedding_model_id)
      WHERE embedding_model_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agents_company_embedding_model`);
    await queryRunner.query(`ALTER TABLE agents DROP COLUMN IF EXISTS embedding_model_id`);
    await queryRunner.query(`ALTER TABLE agents DROP COLUMN IF EXISTS embedding_model`);
    await queryRunner.query(
      `ALTER TABLE company_marketplace_agent_key_assignments DROP COLUMN IF EXISTS assigned_embedding_model_id`,
    );
    await queryRunner.query(
      `ALTER TABLE marketplace_agent_key_bindings DROP COLUMN IF EXISTS embedding_is_primary`,
    );
    await queryRunner.query(
      `ALTER TABLE marketplace_agent_key_bindings DROP COLUMN IF EXISTS embedding_model_id`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_embedding_models_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS embedding_models`);
  }
}
