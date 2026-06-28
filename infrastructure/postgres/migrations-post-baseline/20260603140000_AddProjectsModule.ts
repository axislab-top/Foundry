import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ProjectsModule：独立项目实体；tasks.project_id 关联；marketplace project_id 指向 projects。
 */
export class AddProjectsModule20260603140000 implements MigrationInterface {
  name = 'AddProjectsModule20260603140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(256) NOT NULL,
        client VARCHAR(256) NOT NULL DEFAULT '',
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        deadline DATE,
        progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        notes TEXT,
        created_by_user_id UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_projects_status CHECK (
          status IN ('active', 'paused', 'completed')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_company_status
      ON projects(company_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_company_client
      ON projects(company_id, client)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_company_created
      ON projects(company_id, created_at DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE projects ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE projects FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_projects ON projects
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_projects ON projects
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_company_project
      ON tasks(company_id, project_id)
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      DROP CONSTRAINT IF EXISTS marketplace_hire_requests_project_id_fkey
    `);
    await queryRunner.query(`
      UPDATE marketplace_hire_requests SET project_id = NULL WHERE project_id IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      ADD CONSTRAINT marketplace_hire_requests_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_subscriptions
      DROP CONSTRAINT IF EXISTS marketplace_agent_subscriptions_project_id_fkey
    `);
    await queryRunner.query(`
      UPDATE marketplace_agent_subscriptions SET project_id = NULL WHERE project_id IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agent_subscriptions
      ADD CONSTRAINT marketplace_agent_subscriptions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agent_subscriptions
      DROP CONSTRAINT IF EXISTS marketplace_agent_subscriptions_project_id_fkey
    `);
    await queryRunner.query(`
      UPDATE marketplace_agent_subscriptions SET project_id = NULL WHERE project_id IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agent_subscriptions
      ADD CONSTRAINT marketplace_agent_subscriptions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES tasks(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      DROP CONSTRAINT IF EXISTS marketplace_hire_requests_project_id_fkey
    `);
    await queryRunner.query(`
      UPDATE marketplace_hire_requests SET project_id = NULL WHERE project_id IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      ADD CONSTRAINT marketplace_hire_requests_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES tasks(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_tasks_company_project`);
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS project_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS projects`);
  }
}
