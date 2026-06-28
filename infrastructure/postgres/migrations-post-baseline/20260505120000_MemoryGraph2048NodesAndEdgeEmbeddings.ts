import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Memory Graph 升级至 2048 维：
 * - memory_nodes：与 memory_entries 1:1 的图检索/多模态物化向量（固定 2048）
 * - memory_edges.embedding：可选边级向量（跨模态/重排预留），默认 NULL，非空则须 2048
 */
export class MemoryGraph2048NodesAndEdgeEmbeddings20260505120000 implements MigrationInterface {
  name = 'MemoryGraph2048NodesAndEdgeEmbeddings20260505120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memory_nodes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        memory_entry_id uuid NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
        embedding double precision[] NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT memory_nodes_embedding_dim CHECK (array_length(embedding, 1) = 2048),
        CONSTRAINT uq_memory_nodes_entry UNIQUE (memory_entry_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_nodes_company
      ON memory_nodes(company_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_nodes_company_updated
      ON memory_nodes(company_id, updated_at DESC)
    `);
    await queryRunner.query(`
      COMMENT ON TABLE memory_nodes IS 'Memory Graph 物化节点向量（固定 2048）；与 memory_entries 同步，用于多模态全维检索与图扩展'
    `);

    await queryRunner.query(`ALTER TABLE memory_nodes ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE memory_nodes FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_memory_nodes ON memory_nodes`);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_memory_nodes ON memory_nodes
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE memory_edges
      ADD COLUMN IF NOT EXISTS embedding double precision[]
    `);
    await queryRunner.query(`
      ALTER TABLE memory_edges DROP CONSTRAINT IF EXISTS memory_edges_embedding_dim
    `);
    await queryRunner.query(`
      ALTER TABLE memory_edges
      ADD CONSTRAINT memory_edges_embedding_dim CHECK (
        embedding IS NULL
        OR (array_length(embedding, 1) IS NOT NULL AND array_length(embedding, 1) = 2048)
      )
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN memory_edges.embedding IS '可选边级 2048 向量（跨模态/重排）；默认 NULL，回填时可用 from_entry 向量快照'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS company_isolation_on_memory_nodes ON memory_nodes`);
    await queryRunner.query(`ALTER TABLE memory_nodes NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE memory_nodes DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      ALTER TABLE memory_edges DROP CONSTRAINT IF EXISTS memory_edges_embedding_dim
    `);
    await queryRunner.query(`
      ALTER TABLE memory_edges DROP COLUMN IF EXISTS embedding
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS memory_nodes`);
  }
}
