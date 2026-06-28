import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 向量模型配置简化：
 * - 移除 Agent 级 embedding 快照字段（agents.embedding_model_id / agents.embedding_model）
 * - 保留平台默认 + 公司/部门级覆盖链路（不影响 memory embedding resolver）
 */
export class RemoveAgentEmbeddingModelColumns20260424090000 implements MigrationInterface {
  name = 'RemoveAgentEmbeddingModelColumns20260424090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agents_company_embedding_model
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
            AND conname = 'fk_agents_embedding_model_to_llm_models'
        LOOP
          EXECUTE format('ALTER TABLE agents DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE agents DROP COLUMN IF EXISTS embedding_model_id
    `);
    await queryRunner.query(`
      ALTER TABLE agents DROP COLUMN IF EXISTS embedding_model
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(120)
    `);
    await queryRunner.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS embedding_model_id UUID REFERENCES llm_models(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_company_embedding_model
      ON agents(company_id, embedding_model_id)
      WHERE embedding_model_id IS NOT NULL
    `);
  }
}

