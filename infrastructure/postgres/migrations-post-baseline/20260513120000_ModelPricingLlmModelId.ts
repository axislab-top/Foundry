import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 平台/租户 model_pricing 与 llm_models 主键绑定；解析时优先 llm_model_id。
 */
export class ModelPricingLlmModelId20260513120000 implements MigrationInterface {
  name = 'ModelPricingLlmModelId20260513120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE model_pricing
        ADD COLUMN IF NOT EXISTS llm_model_id UUID NULL
        REFERENCES llm_models(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN model_pricing.llm_model_id IS '目录行绑定的 llm_models.id；非空时计费解析优先于此列'
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS uq_model_pricing_platform_model_effective`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_model_pricing_platform_llm_model_effective
        ON model_pricing (llm_model_id, effective_from)
        WHERE company_id IS NULL AND llm_model_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_model_pricing_platform_model_name_legacy_effective
        ON model_pricing (model_name, effective_from)
        WHERE company_id IS NULL AND llm_model_id IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_model_pricing_platform_llm_model_active
        ON model_pricing (llm_model_id, effective_from DESC)
        WHERE company_id IS NULL AND llm_model_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE model_pricing mp
      SET llm_model_id = s.lid
      FROM (
        SELECT
          mp_inner.id AS pid,
          (array_agg(lm.id ORDER BY lm.provider_code))[1] AS lid
        FROM model_pricing mp_inner
        INNER JOIN llm_models lm ON lm.model_name = mp_inner.model_name
        WHERE mp_inner.llm_model_id IS NULL
        GROUP BY mp_inner.id
        HAVING COUNT(DISTINCT lm.id) = 1
      ) s
      WHERE mp.id = s.pid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_model_pricing_platform_llm_model_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_model_pricing_platform_model_name_legacy_effective`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_model_pricing_platform_llm_model_effective`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_model_pricing_platform_model_effective
        ON model_pricing (model_name, effective_from)
        WHERE company_id IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE model_pricing DROP COLUMN IF EXISTS llm_model_id
    `);
  }
}
