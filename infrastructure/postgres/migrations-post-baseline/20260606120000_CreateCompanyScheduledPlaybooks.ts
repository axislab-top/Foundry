import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * company_scheduled_playbooks：用户自定义定时 Playbook 规则。
 * API: scheduledPlaybooks.*
 */
export class CreateCompanyScheduledPlaybooks20260606120000 implements MigrationInterface {
  name = 'CreateCompanyScheduledPlaybooks20260606120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_scheduled_playbooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(256) NOT NULL,
        description TEXT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        schedule_kind VARCHAR(16) NOT NULL DEFAULT 'daily',
        time_of_day VARCHAR(5) NULL,
        days_of_week SMALLINT[] NULL,
        cron_expression VARCHAR(128) NULL,
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
        assignee_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        skill_name VARCHAR(64) NOT NULL DEFAULT 'ops-playbook',
        playbook_args JSONB NOT NULL DEFAULT '{}'::jsonb,
        delivery_channel VARCHAR(16) NOT NULL DEFAULT 'none',
        requires_human_approval BOOLEAN NOT NULL DEFAULT false,
        next_run_at TIMESTAMPTZ NOT NULL,
        last_run_at TIMESTAMPTZ NULL,
        last_task_id UUID NULL,
        last_run_status VARCHAR(16) NULL,
        created_by_user_id UUID NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_company_scheduled_playbook_kind CHECK (
          schedule_kind IN ('daily', 'weekly', 'cron')
        ),
        CONSTRAINT chk_company_scheduled_playbook_delivery CHECK (
          delivery_channel IN ('none', 'main_room')
        ),
        CONSTRAINT chk_company_scheduled_playbook_last_run_status CHECK (
          last_run_status IS NULL OR last_run_status IN ('succeeded', 'failed', 'skipped', 'enqueued')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_scheduled_playbooks_due
      ON company_scheduled_playbooks(company_id, enabled, next_run_at)
    `);

    await queryRunner.query(`
      COMMENT ON TABLE company_scheduled_playbooks IS
        'User-defined scheduled playbook rules; enqueued as agent tasks on heartbeat tick'
    `);

    await queryRunner.query(`
      ALTER TABLE company_scheduled_playbooks ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_scheduled_playbooks FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_scheduled_playbooks
      ON company_scheduled_playbooks
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_company_scheduled_playbooks
      ON company_scheduled_playbooks
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_scheduled_playbooks
      ON company_scheduled_playbooks
    `);
    await queryRunner.query(`
      ALTER TABLE company_scheduled_playbooks NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_scheduled_playbooks DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS company_scheduled_playbooks
    `);
  }
}
