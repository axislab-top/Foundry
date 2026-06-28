import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CEO 三层配置（Classifier / Light / Heavy）
 * - marketplace_agents.ceo_layer_config：模板默认值
 * - company_ceo_layer_configs.ceo_layer_config：公司实例覆盖（JSONB）
 */
export class AddCeoLayerConfigTables1772100000000 implements MigrationInterface {
  name = 'AddCeoLayerConfigTables1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS ceo_layer_config JSONB NOT NULL DEFAULT '{}'::jsonb
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_ceo_layer_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        ceo_layer_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_ceo_layer_configs_company_id
      ON company_ceo_layer_configs(company_id)
    `);

    await queryRunner.query(`
      ALTER TABLE company_ceo_layer_configs ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_ceo_layer_configs FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_ceo_layer_configs
      ON company_ceo_layer_configs
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_company_ceo_layer_configs
      ON company_ceo_layer_configs
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_ceo_layer_configs
      ON company_ceo_layer_configs
    `);
    await queryRunner.query(`
      ALTER TABLE company_ceo_layer_configs NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_ceo_layer_configs DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS company_ceo_layer_configs
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      DROP COLUMN IF EXISTS ceo_layer_config
    `);
  }
}

