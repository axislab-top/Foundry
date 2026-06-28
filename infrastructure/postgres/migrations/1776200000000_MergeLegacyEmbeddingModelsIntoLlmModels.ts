import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 强制统一 Embedding 模型池：
 * - 将 legacy `embedding_models` 数据迁入 `llm_models(model_type='embedding')`
 * - 迁移 secret 到 `llm_keys.llm_model_id`
 * - 将 embedding_model_id 相关外键从 embedding_models 切到 llm_models
 * - 删除 legacy `embedding_models`
 */
export class MergeLegacyEmbeddingModelsIntoLlmModels1776200000000 implements MigrationInterface {
  name = 'MergeLegacyEmbeddingModelsIntoLlmModels1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 确保 legacy provider 存在于 llm_providers（最小保守策略：openai kind）
    await queryRunner.query(`
      INSERT INTO llm_providers(code, display_name, kind, request_url)
      SELECT DISTINCT
        e.provider,
        e.provider,
        'openai',
        COALESCE(NULLIF(TRIM(e.request_url), ''), 'https://api.openai.com/v1')
      FROM embedding_models e
      WHERE NOT EXISTS (
        SELECT 1 FROM llm_providers p WHERE p.code = e.provider
      )
    `);

    // 2) 迁移 legacy embedding_models -> llm_models（保留 id，避免绑定 id 失效）
    await queryRunner.query(`
      INSERT INTO llm_models(
        id,
        provider_code,
        model_name,
        model_type,
        request_path_suffix,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        e.id,
        e.provider,
        e.model_name,
        'embedding',
        '/embeddings',
        e.is_active,
        e.created_at,
        e.updated_at
      FROM embedding_models e
      ON CONFLICT (id) DO NOTHING
    `);

    // 3) 迁移 encrypted_secret -> llm_keys（若该模型尚无 key）
    await queryRunner.query(`
      INSERT INTO llm_keys(
        llm_model_id,
        provider,
        model_name,
        key_alias,
        encrypted_secret,
        is_active,
        daily_quota_tokens,
        last_used_at,
        created_at,
        updated_at
      )
      SELECT
        e.id,
        e.provider,
        e.model_name,
        CONCAT('emb-migrated-', LEFT(e.id::text, 8)),
        e.encrypted_secret,
        true,
        0,
        NULL,
        COALESCE(e.created_at, CURRENT_TIMESTAMP),
        COALESCE(e.updated_at, CURRENT_TIMESTAMP)
      FROM embedding_models e
      WHERE COALESCE(TRIM(e.encrypted_secret), '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM llm_keys k WHERE k.llm_model_id = e.id
        )
    `);

    // 4) 切换 embedding_model_id 外键目标：embedding_models -> llm_models
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'marketplace_agent_key_bindings'::regclass
            AND contype = 'f'
            AND confrelid = 'embedding_models'::regclass
        LOOP
          EXECUTE format('ALTER TABLE marketplace_agent_key_bindings DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'company_marketplace_agent_key_assignments'::regclass
            AND contype = 'f'
            AND confrelid = 'embedding_models'::regclass
        LOOP
          EXECUTE format('ALTER TABLE company_marketplace_agent_key_assignments DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'agents'::regclass
            AND contype = 'f'
            AND confrelid = 'embedding_models'::regclass
        LOOP
          EXECUTE format('ALTER TABLE agents DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_key_bindings
      ADD CONSTRAINT fk_marketplace_binding_embedding_model_to_llm_models
      FOREIGN KEY (embedding_model_id) REFERENCES llm_models(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      ADD CONSTRAINT fk_company_assignment_embedding_model_to_llm_models
      FOREIGN KEY (assigned_embedding_model_id) REFERENCES llm_models(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE agents
      ADD CONSTRAINT fk_agents_embedding_model_to_llm_models
      FOREIGN KEY (embedding_model_id) REFERENCES llm_models(id) ON DELETE SET NULL
    `);

    // 5) 删除 legacy 表
    await queryRunner.query(`DROP TABLE IF EXISTS embedding_models`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 不回滚到 legacy 结构（防止回退破坏新池），保持 no-op
    await queryRunner.query(`SELECT 1`);
  }
}

