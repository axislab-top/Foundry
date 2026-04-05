import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2: allow run-scoped execution logs (CEO heartbeat) without a concrete task row.
 */
export class TaskExecutionLogsNullableTaskId1770500000000 implements MigrationInterface {
  name = 'TaskExecutionLogsNullableTaskId1770500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE task_execution_logs
      ALTER COLUMN task_id DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM task_execution_logs WHERE task_id IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE task_execution_logs
      ALTER COLUMN task_id SET NOT NULL
    `);
  }
}
