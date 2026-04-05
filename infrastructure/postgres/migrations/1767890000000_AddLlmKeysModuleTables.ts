import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LLM Keys（大模型 Key 池）表结构：
 * - llm_keys：provider/model/key_alias + 加密后的 secret + 每日 token 配额
 * - llm_key_daily_usage：按天聚合 used_tokens（用于剩余配额与健康状态）
 * - billing_records：新增 llm_key_id（用于使用历史统计/关联）
 */
export class AddLlmKeysModuleTables1767890000000 implements MigrationInterface {
  name = 'AddLlmKeysModuleTables1767890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS llm_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(32) NOT NULL,
        model_name VARCHAR(120) NOT NULL,
        key_alias VARCHAR(120) NOT NULL,
        encrypted_secret TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        daily_quota_tokens BIGINT NOT NULL DEFAULT 0 CHECK (daily_quota_tokens >= 0),
        last_used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_llm_keys_provider_model_alias UNIQUE (provider, model_name, key_alias)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_keys_provider_model
      ON llm_keys(provider, model_name);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_keys_is_active
      ON llm_keys(is_active);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS llm_key_daily_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        llm_key_id UUID NOT NULL REFERENCES llm_keys(id) ON DELETE CASCADE,
        usage_date DATE NOT NULL,
        used_tokens BIGINT NOT NULL DEFAULT 0 CHECK (used_tokens >= 0),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_llm_key_daily_usage UNIQUE (llm_key_id, usage_date)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_key_daily_usage_date
      ON llm_key_daily_usage(usage_date, used_tokens DESC);
    `);

    await queryRunner.query(`
      ALTER TABLE billing_records
      ADD COLUMN IF NOT EXISTS llm_key_id UUID REFERENCES llm_keys(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_records_llm_key_occurred
      ON billing_records(llm_key_id, occurred_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_records_company_llm_key
      ON billing_records(company_id, llm_key_id, occurred_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_records
      DROP COLUMN IF EXISTS llm_key_id
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_key_daily_usage`);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_keys`);
  }
}

