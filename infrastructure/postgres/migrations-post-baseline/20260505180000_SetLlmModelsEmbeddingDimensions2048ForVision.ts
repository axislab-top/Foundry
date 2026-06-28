import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 将豆包类 embedding-vision 等模型的 embedding_dimensions 显式标为 2048，
 * 与 MEMORY_EMBEDDING_DIMENSIONS=2048 及池解析一致。
 */
export class SetLlmModelsEmbeddingDimensions2048ForVision20260505180000 implements MigrationInterface {
  name = 'SetLlmModelsEmbeddingDimensions2048ForVision20260505180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE llm_models
      SET embedding_dimensions = 2048
      WHERE model_type = 'embedding'
        AND embedding_dimensions IS NULL
        AND model_name ~* 'embedding-vision'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN llm_models.embedding_dimensions IS 'Embedding 向量维度（model_type=embedding）；为空时按模型名推断（如 embedding-vision→2048），否则 MEMORY_EMBEDDING_DIMENSIONS'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE llm_models
      SET embedding_dimensions = NULL
      WHERE model_type = 'embedding'
        AND embedding_dimensions = 2048
        AND model_name ~* 'embedding-vision'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN llm_models.embedding_dimensions IS 'Embedding 向量维度（model_type=embedding）；为空时运行时回退 1536'
    `);
  }
}
