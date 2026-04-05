import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M1 数字公司竖切：task_runs（RunRecord）、task_dependencies（DAG）、execution_logs.run_id、awaiting_approval 状态。
 */
export class AddTaskRunsDependenciesAndRunId1770400000000 implements MigrationInterface {
  name = 'AddTaskRunsDependenciesAndRunId1770400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        trigger_source VARCHAR(32) NOT NULL DEFAULT 'manual',
        temporal_workflow_id VARCHAR(256),
        temporal_run_id VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'running',
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP,
        error_summary TEXT,
        cost_estimate DECIMAL(14, 4),
        metadata JSONB,
        CONSTRAINT chk_task_runs_trigger CHECK (
          trigger_source IN ('temporal', 'schedule', 'manual', 'nest_timer')
        ),
        CONSTRAINT chk_task_runs_status CHECK (
          status IN ('running', 'succeeded', 'failed')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_company_started
      ON task_runs(company_id, started_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_company_status
      ON task_runs(company_id, status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_task_dep UNIQUE (company_id, task_id, depends_on_task_id),
        CONSTRAINT chk_task_dep_no_self CHECK (task_id <> depends_on_task_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_company_task
      ON task_dependencies(company_id, task_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_company_depends
      ON task_dependencies(company_id, depends_on_task_id)
    `);

    await queryRunner.query(`
      ALTER TABLE task_execution_logs
      ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES task_runs(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_execution_logs_run
      ON task_execution_logs(company_id, run_id, created_at DESC)
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

    for (const table of ['task_runs', 'task_dependencies']) {
      await queryRunner.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY
      `);
      await queryRunner.query(`
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY
      `);
      await queryRunner.query(`
        DROP POLICY IF EXISTS company_isolation_on_${table} ON ${table}
      `);
      await queryRunner.query(`
        CREATE POLICY company_isolation_on_${table} ON ${table}
        USING (company_id = current_setting('app.current_tenant', true)::uuid)
        WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_task_execution_logs_run
    `);
    await queryRunner.query(`
      ALTER TABLE task_execution_logs DROP COLUMN IF EXISTS run_id
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS task_dependencies
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS task_runs
    `);

    await queryRunner.query(`
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_status
    `);
    await queryRunner.query(`
      ALTER TABLE tasks ADD CONSTRAINT chk_tasks_status CHECK (
        status IN ('pending', 'in_progress', 'review', 'completed', 'blocked', 'cancelled')
      )
    `);
  }
}
