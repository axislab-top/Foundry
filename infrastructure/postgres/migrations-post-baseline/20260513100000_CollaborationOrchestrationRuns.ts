import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 主房编排运行记录（与默认 `pnpm migrate:run` 路径对齐：post-baseline）。
 * 使用 IF NOT EXISTS，与历史上若已从 `migrations/` 目录执行过的环境兼容。
 */
export class CollaborationOrchestrationRuns20260513100000 implements MigrationInterface {
  name = 'CollaborationOrchestrationRuns20260513100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS collaboration_orchestration_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        room_id uuid NOT NULL,
        source_message_id uuid NOT NULL,
        worker_run_id uuid NULL,
        status varchar(32) NOT NULL,
        stage varchar(256) NULL,
        error_code varchar(64) NULL,
        error_message text NULL,
        metadata jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_collab_orch_run_company_message UNIQUE (company_id, source_message_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_collab_orch_runs_room_updated
      ON collaboration_orchestration_runs (company_id, room_id, updated_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS collaboration_orchestration_runs`);
  }
}
