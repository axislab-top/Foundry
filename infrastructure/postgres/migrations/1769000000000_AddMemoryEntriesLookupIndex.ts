import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMemoryEntriesLookupIndex1769000000000
  implements MigrationInterface
{
  name = 'AddMemoryEntriesLookupIndex1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_company_coll_source_created
      ON memory_entries(company_id, collection_id, source_type, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_entries_company_coll_source_created
    `);
  }
}

