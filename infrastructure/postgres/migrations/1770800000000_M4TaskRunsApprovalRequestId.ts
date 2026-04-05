import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M4：Run trace 关联审批单（可选），便于 M2 观测与审计。
 */
export class M4TaskRunsApprovalRequestId1770800000000 implements MigrationInterface {
  name = 'M4TaskRunsApprovalRequestId1770800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE task_runs
      ADD COLUMN IF NOT EXISTS approval_request_id UUID NULL
      REFERENCES approval_requests(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_approval_request
      ON task_runs(approval_request_id)
      WHERE approval_request_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE task_runs DROP COLUMN IF EXISTS approval_request_id
    `);
  }
}
