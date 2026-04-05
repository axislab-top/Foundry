import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3：任务 paused 状态、RunRecord 实际成本、budgets 临界预警阈值（剩余约 10%）。
 */
export class M3BudgetHardStopPausedAndRunCost1770600000000 implements MigrationInterface {
  name = 'M3BudgetHardStopPausedAndRunCost1770600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_status
    `);
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT chk_tasks_status CHECK (
        status IN (
          'pending',
          'in_progress',
          'review',
          'awaiting_approval',
          'completed',
          'blocked',
          'cancelled',
          'paused'
        )
      )
    `);

    await queryRunner.query(`
      ALTER TABLE task_runs
      ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(14, 4)
    `);

    await queryRunner.query(`
      ALTER TABLE budgets
      ADD COLUMN IF NOT EXISTS critical_threshold NUMERIC(5, 4) NOT NULL DEFAULT 0.9
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE budgets DROP COLUMN IF EXISTS critical_threshold
    `);
    await queryRunner.query(`
      ALTER TABLE task_runs DROP COLUMN IF EXISTS actual_cost
    `);

    await queryRunner.query(`
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_status
    `);
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT chk_tasks_status CHECK (
        status IN (
          'pending',
          'in_progress',
          'review',
          'awaiting_approval',
          'completed',
          'blocked',
          'cancelled'
        )
      )
    `);
  }
}
