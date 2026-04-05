import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M4：审批请求、审计日志、执行令牌（一次性消费）、公司级执行熔断。
 */
export class M4ApprovalRequestsAndKillSwitch1770700000000 implements MigrationInterface {
  name = 'M4ApprovalRequestsAndKillSwitch1770700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS execution_paused BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        risk_level VARCHAR(8) NOT NULL DEFAULT 'L2',
        action_type VARCHAR(64) NOT NULL,
        context JSONB NULL,
        temporal_workflow_id VARCHAR(256) NULL,
        created_by UUID NULL,
        resolved_by UUID NULL,
        resolved_at TIMESTAMP NULL,
        rejection_reason TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_approval_requests_status CHECK (
          status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')
        ),
        CONSTRAINT chk_approval_requests_risk CHECK (
          risk_level IN ('L0', 'L1', 'L2', 'L3')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status
      ON approval_requests(company_id, status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS approval_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        approval_request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
        event_type VARCHAR(32) NOT NULL,
        payload JSONB NULL,
        actor_id UUID NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_approval_audit_company_created
      ON approval_audit_logs(company_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS approval_execution_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        approval_request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
        action VARCHAR(128) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        consumed_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_approval_exec_tokens_company_expires
      ON approval_execution_tokens(company_id, expires_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_approval_exec_tokens_approval
      ON approval_execution_tokens(approval_request_id)
    `);

    await queryRunner.query(`
      ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_approval_requests ON approval_requests
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_approval_requests ON approval_requests
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE approval_audit_logs ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE approval_audit_logs FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_approval_audit_logs ON approval_audit_logs
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_approval_audit_logs ON approval_audit_logs
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE approval_execution_tokens ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE approval_execution_tokens FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_approval_execution_tokens ON approval_execution_tokens
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_approval_execution_tokens ON approval_execution_tokens
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_approval_execution_tokens ON approval_execution_tokens
    `);
    await queryRunner.query(`
      ALTER TABLE approval_execution_tokens NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE approval_execution_tokens DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_approval_audit_logs ON approval_audit_logs
    `);
    await queryRunner.query(`
      ALTER TABLE approval_audit_logs NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE approval_audit_logs DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_approval_requests ON approval_requests
    `);
    await queryRunner.query(`
      ALTER TABLE approval_requests NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE approval_requests DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS approval_execution_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS approval_audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS approval_requests`);

    await queryRunner.query(`
      ALTER TABLE companies DROP COLUMN IF EXISTS execution_paused
    `);
  }
}
