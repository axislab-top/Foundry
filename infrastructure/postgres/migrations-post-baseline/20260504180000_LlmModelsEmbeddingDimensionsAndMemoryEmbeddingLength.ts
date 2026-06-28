import { MigrationInterface, QueryRunner } from 'typeorm';

export class LlmModelsEmbeddingDimensionsAndMemoryEmbeddingLength20260504180000 implements MigrationInterface {
  name = 'LlmModelsEmbeddingDimensionsAndMemoryEmbeddingLength20260504180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE llm_models
      ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN llm_models.embedding_dimensions IS 'Embedding 向量维度（model_type=embedding）；为空时运行时回退 1536'
    `);

    await queryRunner.query(`
      ALTER TABLE memory_entries DROP CONSTRAINT IF EXISTS memory_entries_embedding_check
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD CONSTRAINT memory_entries_embedding_length_check
      CHECK (
        array_length(embedding, 1) IS NOT NULL
        AND array_length(embedding, 1) >= 256
        AND array_length(embedding, 1) <= 8192
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP CONSTRAINT IF EXISTS memory_entries_embedding_length_check
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD CONSTRAINT memory_entries_embedding_check CHECK ((array_length(embedding, 1) = 1536))
    `);
    await queryRunner.query(`
      ALTER TABLE llm_models DROP COLUMN IF EXISTS embedding_dimensions
    `);
  }
}
