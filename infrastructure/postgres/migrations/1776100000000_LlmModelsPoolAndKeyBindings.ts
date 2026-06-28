import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LLM Models（模型定义池）
 * - llm_models：属于某个 provider 的模型条目，带 modelType 与请求后缀（按类型可不同）
 * - llm_keys：新增 llm_model_id 外键，将 key 绑定到模型条目
 *
 * 兼容策略：
 * - 保留 llm_keys.provider / llm_keys.model_name（用于旧代码/筛选/排障日志）
 * - 迁移时从 llm_keys 的 (provider, model_name) 去重生成 llm_models（默认 model_type='chat'）
 */
export class LlmModelsPoolAndKeyBindings1776100000000 implements MigrationInterface {
  name = 'LlmModelsPoolAndKeyBindings1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS llm_models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_code VARCHAR(32) NOT NULL,
        model_name VARCHAR(120) NOT NULL,
        model_type VARCHAR(24) NOT NULL DEFAULT 'chat',
        request_path_suffix VARCHAR(200),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_llm_models_type CHECK (model_type IN ('chat','embedding','rerank','image','audio','moderation','other')),
        CONSTRAINT uq_llm_models_unique UNIQUE (provider_code, model_name, model_type)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_models_provider_type
      ON llm_models(provider_code, model_type);
    `);

    await queryRunner.query(`
      ALTER TABLE llm_keys
      ADD COLUMN IF NOT EXISTS llm_model_id UUID
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_keys_llm_model_id
      ON llm_keys(llm_model_id);
    `);

    // 1) Backfill models from existing keys (provider, model_name) with default type 'chat'
    await queryRunner.query(`
      INSERT INTO llm_models(provider_code, model_name, model_type, request_path_suffix, is_active)
      SELECT DISTINCT
        k.provider AS provider_code,
        k.model_name AS model_name,
        'chat' AS model_type,
        NULL::varchar AS request_path_suffix,
        true AS is_active
      FROM llm_keys k
      WHERE k.provider IS NOT NULL AND k.model_name IS NOT NULL
      ON CONFLICT (provider_code, model_name, model_type) DO NOTHING
    `);

    // 2) Bind keys to models
    await queryRunner.query(`
      UPDATE llm_keys k
      SET llm_model_id = m.id
      FROM llm_models m
      WHERE
        k.llm_model_id IS NULL
        AND m.provider_code = k.provider
        AND m.model_name = k.model_name
        AND m.model_type = 'chat'
    `);

    // 3) Add FK after backfill (safe even if some rows remain null)
    await queryRunner.query(`
      ALTER TABLE llm_keys
      ADD CONSTRAINT fk_llm_keys_llm_model_id
      FOREIGN KEY (llm_model_id) REFERENCES llm_models(id)
      ON DELETE SET NULL
    `);

    // 4) Optional: if your data has duplicates, this may fail; keep old constraint as-is.
    // Add a more future-proof uniqueness for (llm_model_id, key_alias) but only when model_id is set.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_llm_keys_model_alias
      ON llm_keys(llm_model_id, key_alias)
      WHERE llm_model_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_llm_keys_model_alias`);
    await queryRunner.query(`ALTER TABLE llm_keys DROP CONSTRAINT IF EXISTS fk_llm_keys_llm_model_id`);
    await queryRunner.query(`ALTER TABLE llm_keys DROP COLUMN IF EXISTS llm_model_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_models`);
  }
}

