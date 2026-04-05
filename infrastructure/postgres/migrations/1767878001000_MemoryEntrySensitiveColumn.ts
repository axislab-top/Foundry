import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 敏感记忆标记：检索时对非特权调用方返回脱敏占位。
 */
export class MemoryEntrySensitiveColumn1767878001000 implements MigrationInterface {
  name = 'MemoryEntrySensitiveColumn1767878001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_sensitive
      ON memory_entries(company_id, is_sensitive)
      WHERE is_sensitive = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_memory_entries_sensitive`);
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS is_sensitive
    `);
  }
}
