import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMemoryGovernanceFields2026042000000 implements MigrationInterface {
  name = 'AddMemoryGovernanceFields2026042000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS importance_score numeric(3,2) NOT NULL DEFAULT 0.5
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS cycle_depth integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS lineage_hash varchar(64) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS retention_class varchar(20) NOT NULL DEFAULT 'medium'
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS decay_at timestamp NULL
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries
      ADD COLUMN IF NOT EXISTS blocked_reason varchar(100) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_importance_created
      ON memory_entries(company_id, importance_score DESC, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_cycle_depth
      ON memory_entries(company_id, cycle_depth, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_lineage_hash
      ON memory_entries(company_id, lineage_hash)
      WHERE lineage_hash IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_entries_retention_decay
      ON memory_entries(company_id, retention_class, decay_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Safety note:
    // 回滚后建议立即运行回填 Job 恢复旧数据一致性。
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_entries_retention_decay
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_entries_lineage_hash
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_entries_cycle_depth
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_memory_entries_importance_created
    `);

    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS blocked_reason
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS decay_at
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS retention_class
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS lineage_hash
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS cycle_depth
    `);
    await queryRunner.query(`
      ALTER TABLE memory_entries DROP COLUMN IF EXISTS importance_score
    `);
  }
}

