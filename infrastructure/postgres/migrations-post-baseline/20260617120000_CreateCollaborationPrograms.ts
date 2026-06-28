import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 主群 Collaboration Program SSOT（与默认 `pnpm migrate:run` 路径对齐：post-baseline）。
 * 使用 IF NOT EXISTS，与 legacy `migrations/` 目录中同名迁移兼容。
 */
export class CreateCollaborationPrograms20260617120000 implements MigrationInterface {
  name = 'CreateCollaborationPrograms20260617120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS collaboration_programs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        room_id UUID NOT NULL,
        thread_id VARCHAR(128) NOT NULL DEFAULT 'main',
        source_message_id UUID NOT NULL,
        phase VARCHAR(32) NOT NULL DEFAULT 'intake',
        brief JSONB NOT NULL,
        parent_goal_task_id UUID,
        dispatch JSONB,
        alignment JSONB,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_collab_programs_room_active
      ON collaboration_programs (company_id, room_id, thread_id, updated_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_collab_programs_source_message
      ON collaboration_programs (company_id, source_message_id)
    `);
    await queryRunner.query(`
      ALTER TABLE collaboration_orchestration_runs
      ADD COLUMN IF NOT EXISTS program_id UUID
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_collab_orch_runs_program
      ON collaboration_orchestration_runs (company_id, program_id)
      WHERE program_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_orch_runs_program`);
    await queryRunner.query(`
      ALTER TABLE collaboration_orchestration_runs
      DROP COLUMN IF EXISTS program_id
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_programs_source_message`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_programs_room_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS collaboration_programs`);
  }
}
