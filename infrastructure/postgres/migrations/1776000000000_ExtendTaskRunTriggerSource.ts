import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 扩展 task_runs.trigger_source，支持事件触发的自治周期审计。
 */
export class ExtendTaskRunTriggerSource1776000000000 implements MigrationInterface {
  name = 'ExtendTaskRunTriggerSource1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE task_runs DROP CONSTRAINT IF EXISTS chk_task_runs_trigger;
    `);
    await queryRunner.query(`
      ALTER TABLE task_runs ADD CONSTRAINT chk_task_runs_trigger CHECK (
        trigger_source IN (
          'temporal',
          'schedule',
          'manual',
          'nest_timer',
          'task_completed',
          'budget_warning'
        )
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE task_runs DROP CONSTRAINT IF EXISTS chk_task_runs_trigger;
    `);
    await queryRunner.query(`
      ALTER TABLE task_runs ADD CONSTRAINT chk_task_runs_trigger CHECK (
        trigger_source IN ('temporal', 'schedule', 'manual', 'nest_timer')
      );
    `);
  }
}
