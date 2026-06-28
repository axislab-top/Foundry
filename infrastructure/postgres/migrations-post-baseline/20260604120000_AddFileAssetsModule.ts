import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FileAssetsModule：公司文件资产 Registry（与对象存储 blob 分离）。
 */
export class AddFileAssetsModule20260604120000 implements MigrationInterface {
  name = 'AddFileAssetsModule20260604120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS file_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        storage_path TEXT NOT NULL,
        name VARCHAR(512) NOT NULL,
        size BIGINT NOT NULL DEFAULT 0,
        content_type VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
        source_type VARCHAR(16) NOT NULL DEFAULT 'user',
        source_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
        source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        source_run_id UUID,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        category VARCHAR(32) NOT NULL DEFAULT 'other',
        description TEXT,
        ingest_status VARCHAR(16) NOT NULL DEFAULT 'none',
        ingest_correlation_id UUID,
        ingest_chunk_count INTEGER,
        memory_namespace TEXT,
        created_by_user_id UUID,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_file_assets_source_type CHECK (
          source_type IN ('agent', 'user', 'system')
        ),
        CONSTRAINT chk_file_assets_category CHECK (
          category IN ('report', 'doc', 'reference', 'contract', 'other')
        ),
        CONSTRAINT chk_file_assets_ingest_status CHECK (
          ingest_status IN ('none', 'pending', 'done', 'failed')
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_file_assets_company_storage_path
      ON file_assets(company_id, storage_path)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_file_assets_company_deleted_created
      ON file_assets(company_id, deleted_at, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_file_assets_company_project
      ON file_assets(company_id, project_id)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_file_assets_company_source_type
      ON file_assets(company_id, source_type)
      WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_file_assets_company_category
      ON file_assets(company_id, category)
      WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE file_assets ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE file_assets FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_file_assets ON file_assets
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_file_assets ON file_assets
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS file_assets`);
  }
}
