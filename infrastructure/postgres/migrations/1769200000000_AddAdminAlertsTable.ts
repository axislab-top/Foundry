import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 管理后台告警表：admin_alerts
 */
export class AddAdminAlertsTable1769200000000 implements MigrationInterface {
  name = 'AddAdminAlertsTable1769200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NULL,
        agent_id UUID NULL,
        severity VARCHAR(16) NOT NULL DEFAULT 'low',
        type VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        handled_at TIMESTAMP NULL,
        handled_by UUID NULL,
        remark TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_alerts_company_id
      ON admin_alerts(company_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_alerts_agent_id
      ON admin_alerts(agent_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity
      ON admin_alerts(severity)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_alerts_status
      ON admin_alerts(status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_alerts_type
      ON admin_alerts(type)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_alerts_created_at
      ON admin_alerts(created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS admin_alerts`);
  }
}

