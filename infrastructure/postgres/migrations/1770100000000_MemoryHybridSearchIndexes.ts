import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 混合检索增强：全文 tsvector（GIN）+ metadata JSONB GIN，支撑关键词与元数据过滤。
 * 向量仍为 float8[] + memory_cosine_similarity；后续可迁 pgvector HNSW。
 */
export class MemoryHybridSearchIndexes1770100000000 implements MigrationInterface {
  name = 'MemoryHybridSearchIndexes1770100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS summary TEXT
    `);

    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS content_search tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_content_search
      ON memory_entries USING GIN (content_search)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_metadata_gin
      ON memory_entries USING GIN (metadata jsonb_path_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_entries_metadata_gin
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_entries_content_search
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS content_search
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS summary
    `);
  }
}
