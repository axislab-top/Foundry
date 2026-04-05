import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LLM Providers（大模型服务商）表结构：
 * - llm_providers：providerCode / kind / request_url（服务商 API 请求地址）
 *
 * 注意：当前 llm_keys.provider 仍保持为 varchar（用于与 providerCode 关联）。
 */
export class AddLlmProvidersModuleTables1768000000000 implements MigrationInterface {
  name = 'AddLlmProvidersModuleTables1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS llm_providers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(32) NOT NULL UNIQUE,
        display_name VARCHAR(120) NOT NULL DEFAULT '',
        kind VARCHAR(16) NOT NULL DEFAULT 'openai',
        request_url TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_llm_providers_kind CHECK (kind IN ('openai','anthropic'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_llm_providers_kind
      ON llm_providers(kind);
    `);

    // Seed default providers
    await queryRunner.query(`
      INSERT INTO llm_providers(code, display_name, kind, request_url)
      VALUES
        ('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1'),
        ('anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com')
      ON CONFLICT (code) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS llm_providers
    `);
  }
}

