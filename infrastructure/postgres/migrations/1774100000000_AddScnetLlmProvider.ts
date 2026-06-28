import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SCnet（国家超算互联网）OpenAI 兼容网关：
 * - Chat: POST .../api/llm/v1/chat/completions
 * - Embeddings: POST .../api/llm/v1/embeddings
 * baseURL 使用 /api/llm/v1，与 LangChain ChatOpenAI / OpenAI SDK 路径拼接一致。
 */
export class AddScnetLlmProvider1774100000000 implements MigrationInterface {
  name = 'AddScnetLlmProvider1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO llm_providers(code, display_name, kind, request_url)
      VALUES ('scnet', 'SCnet（超算中心）', 'openai', 'https://api.scnet.cn/api/llm/v1')
      ON CONFLICT (code) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        kind = EXCLUDED.kind,
        request_url = EXCLUDED.request_url,
        updated_at = CURRENT_TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM llm_providers WHERE code = 'scnet'
    `);
  }
}
