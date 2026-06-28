import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 消息处理 Phase 1 表（决策审计 + 异步 job 队列）。
 * 与 apps/api/database/migrations/002_create_message_processing_tables.sql 对齐，
 * 纳入 post-baseline 迁移路径以便 `pnpm migration:run` 自动执行。
 */
export class CreateMessageProcessingTables20260610120000 implements MigrationInterface {
  name = 'CreateMessageProcessingTables20260610120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_processing_decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        message_id UUID NOT NULL,
        room_id UUID NOT NULL,
        correlation_id VARCHAR(128),
        trace_id VARCHAR(128),
        policy_version VARCHAR(32) NOT NULL,
        action VARCHAR(64) NOT NULL,
        decision VARCHAR(32) NOT NULL,
        reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
        profile JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_processing_decisions_company_message_created
      ON message_processing_decisions (company_id, message_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_processing_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        message_id UUID NOT NULL,
        room_id UUID NOT NULL,
        domain VARCHAR(32) NOT NULL DEFAULT 'message',
        job_type VARCHAR(64) NOT NULL,
        dedupe_key VARCHAR(256) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        payload JSONB,
        aggregate_type VARCHAR(64),
        aggregate_id UUID,
        parent_job_id UUID,
        correlation_id VARCHAR(128),
        attempt_count INT NOT NULL DEFAULT 0,
        last_error TEXT,
        next_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_message_processing_jobs_dedupe UNIQUE (company_id, dedupe_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_processing_jobs_company_status_next
      ON message_processing_jobs (company_id, status, next_run_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_processing_jobs_company_domain_status_next
      ON message_processing_jobs (company_id, domain, status, next_run_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_processing_jobs_company_domain_status_next`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_processing_jobs_company_status_next`);
    await queryRunner.query(`DROP TABLE IF EXISTS message_processing_jobs`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_processing_decisions_company_message_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS message_processing_decisions`);
  }
}
