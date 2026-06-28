import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyEmbeddingSettings20260424100000 implements MigrationInterface {
  name = 'AddCompanyEmbeddingSettings20260424100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_embedding_settings (
        company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        default_embedding_model_id UUID REFERENCES llm_models(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS company_embedding_settings
    `);
  }
}

