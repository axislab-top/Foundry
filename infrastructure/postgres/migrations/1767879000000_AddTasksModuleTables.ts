import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TasksModule：树形任务、分配历史、执行日志；company_id RLS 与现有租户模型一致。
 */
export class AddTasksModuleTables1767879000000 implements MigrationInterface {
  name = 'AddTasksModuleTables1767879000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        title VARCHAR(512) NOT NULL,
        description TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        priority VARCHAR(32) NOT NULL DEFAULT 'normal',
        due_date TIMESTAMP,
        expected_output TEXT,
        progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        assignee_type VARCHAR(32) NOT NULL DEFAULT 'unassigned',
        assignee_id UUID,
        skill_ids JSONB,
        blocked_reason TEXT,
        requires_human_approval BOOLEAN NOT NULL DEFAULT false,
        metadata JSONB,
        created_by_user_id UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_tasks_status CHECK (
          status IN ('pending', 'in_progress', 'review', 'completed', 'blocked', 'cancelled')
        ),
        CONSTRAINT chk_tasks_priority CHECK (
          priority IN ('low', 'normal', 'high', 'urgent')
        ),
        CONSTRAINT chk_tasks_assignee_type CHECK (
          assignee_type IN ('unassigned', 'agent', 'organization_node')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_company_parent
      ON tasks(company_id, parent_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_company_status
      ON tasks(company_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_company_assignee
      ON tasks(company_id, assignee_type, assignee_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_company_updated
      ON tasks(company_id, updated_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        assignee_type VARCHAR(32) NOT NULL,
        assignee_id UUID,
        assigned_by_user_id UUID,
        assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unassigned_at TIMESTAMP,
        note TEXT,
        CONSTRAINT chk_task_assignments_type CHECK (
          assignee_type IN ('unassigned', 'agent', 'organization_node')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_assignments_company_task
      ON task_assignments(company_id, task_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_execution_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        agent_id UUID,
        step_type VARCHAR(64) NOT NULL,
        message TEXT,
        output_snapshot JSONB,
        billing_units DECIMAL(12, 4),
        duration_ms INT,
        trace_id VARCHAR(64),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_execution_logs_company_task
      ON task_execution_logs(company_id, task_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_execution_logs_company_agent
      ON task_execution_logs(company_id, agent_id)
    `);

    for (const table of ['tasks', 'task_assignments', 'task_execution_logs']) {
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
    await queryRunner.query(`DROP TABLE IF EXISTS task_execution_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS task_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS tasks`);
  }
}
