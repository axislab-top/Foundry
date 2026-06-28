import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMemoryTemporalGraph2026042100000 implements MigrationInterface {
  name = 'AddMemoryTemporalGraph2026042100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memory_edges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        from_entry_id UUID NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
        to_entry_id UUID NULL REFERENCES memory_entries(id) ON DELETE SET NULL,
        edge_type VARCHAR(50) NOT NULL,
        metadata JSONB NULL,
        valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        valid_to TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_memory_edges_company_from_to_type UNIQUE (company_id, from_entry_id, to_entry_id, edge_type),
        CONSTRAINT chk_memory_edges_type CHECK (
          edge_type IN ('summarizes', 'promoted_to', 'derived_from', 'related_to', 'caused_by')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_edges_company_type_valid_from
      ON memory_edges(company_id, edge_type, valid_from DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_edges_metadata_gin
      ON memory_edges USING GIN (metadata jsonb_path_ops)
    `);

    await queryRunner.query(`
      ALTER TABLE memory_edges ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE memory_edges FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_memory_edges ON memory_edges
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_memory_edges ON memory_edges
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_memory_edges ON memory_edges
    `);
    await queryRunner.query(`
      ALTER TABLE memory_edges NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE memory_edges DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_edges_metadata_gin
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_edges_company_type_valid_from
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS memory_edges
    `);
  }
}

