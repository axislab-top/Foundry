import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MemoryModule：分层记忆 + float8[] 向量（无需 pgvector 扩展，兼容默认 postgres:alpine）
 * 相似度排序使用 memory_cosine_similarity()；后续可迁移至 pgvector 以获得 ANN 索引。
 */
export class AddMemoryModuleTables1767878000000 implements MigrationInterface {
  name = 'AddMemoryModuleTables1767878000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION memory_cosine_similarity(a float8[], b float8[])
      RETURNS float8
      LANGUAGE sql
      IMMUTABLE
      STRICT
      AS $f$
        SELECT CASE
          WHEN (SELECT sum(x * x) FROM unnest(a) AS x(x)) = 0::float8
            OR (SELECT sum(y * y) FROM unnest(b) AS y(y)) = 0::float8
          THEN 0::float8
          ELSE (
            (SELECT sum(x * y) FROM unnest(a, b) AS t(x, y))
            / (
              sqrt((SELECT sum(x * x) FROM unnest(a) AS x(x)))
              * sqrt((SELECT sum(y * y) FROM unnest(b) AS y(y)))
            )
          )
        END
      $f$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memory_collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        namespace VARCHAR(320) NOT NULL,
        label VARCHAR(512),
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_memory_collections_company_namespace UNIQUE (company_id, namespace)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_collections_company
      ON memory_collections(company_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        collection_id UUID NOT NULL REFERENCES memory_collections(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding float8[] NOT NULL CHECK (array_length(embedding, 1) = 1536),
        metadata JSONB,
        source_type VARCHAR(32) NOT NULL,
        source_ref UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_memory_entries_source CHECK (
          source_type IN ('chat', 'task', 'skill', 'document', 'summary', 'manual')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_company_coll_created
      ON memory_entries(company_id, collection_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_entries_chat_dedup
      ON memory_entries(company_id, source_ref)
      WHERE source_type = 'chat' AND source_ref IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE memory_collections ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE memory_collections FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_memory_collections ON memory_collections
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_memory_collections ON memory_collections
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_memory_entries ON memory_entries
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_memory_entries ON memory_entries
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS memory_entries`);
    await queryRunner.query(`DROP TABLE IF EXISTS memory_collections`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS memory_cosine_similarity(float8[], float8[])`,
    );
  }
}
