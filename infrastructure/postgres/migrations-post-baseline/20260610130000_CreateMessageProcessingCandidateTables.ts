import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 消息处理 Phase 1 候选层与 replay 决策表。
 * 自 legacy `infrastructure/postgres/migrations/` 迁入 post-baseline 路径。
 */
export class CreateMessageProcessingCandidateTables20260610130000 implements MigrationInterface {
  name = 'CreateMessageProcessingCandidateTables20260610130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_action_candidates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        room_id UUID NOT NULL,
        message_id UUID NOT NULL,
        dedupe_key VARCHAR(180) NOT NULL,
        kind VARCHAR(64) NOT NULL,
        processing_mode VARCHAR(64) NOT NULL,
        source_action VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        visibility VARCHAR(16) NOT NULL DEFAULT 'user_facing',
        rationale JSONB,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_message_action_candidates_dedupe_key UNIQUE (dedupe_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_action_candidates_message
      ON message_action_candidates (company_id, message_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_action_candidates_room_status
      ON message_action_candidates (company_id, room_id, status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS task_intent_candidates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        room_id UUID NOT NULL,
        source_message_id UUID NOT NULL,
        action_candidate_id UUID,
        created_task_id UUID,
        dedupe_key VARCHAR(180) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'drafted',
        spec_draft JSONB NOT NULL,
        readiness JSONB NOT NULL,
        source_text TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_task_intent_candidates_dedupe_key UNIQUE (dedupe_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_intent_candidates_message
      ON task_intent_candidates (company_id, source_message_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_task_intent_candidates_room_status
      ON task_intent_candidates (company_id, room_id, status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS replay_decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        room_id UUID NOT NULL,
        trigger_message_id UUID NOT NULL,
        dedupe_key VARCHAR(180) NOT NULL,
        kind VARCHAR(64) NOT NULL,
        confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
        requires_user_confirmation BOOLEAN NOT NULL DEFAULT false,
        target_department_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
        target_agent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        summary TEXT NOT NULL DEFAULT '',
        rationale JSONB NOT NULL DEFAULT '[]'::jsonb,
        execution_hint JSONB,
        source VARCHAR(32) NOT NULL DEFAULT 'conversation_replay',
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_replay_decisions_dedupe_key UNIQUE (dedupe_key)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_replay_decisions_room_created
      ON replay_decisions (company_id, room_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_replay_decisions_trigger_message
      ON replay_decisions (company_id, trigger_message_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_replay_decisions_trigger_message`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_replay_decisions_room_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS replay_decisions`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_intent_candidates_room_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_intent_candidates_message`);
    await queryRunner.query(`DROP TABLE IF EXISTS task_intent_candidates`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_action_candidates_room_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_action_candidates_message`);
    await queryRunner.query(`DROP TABLE IF EXISTS message_action_candidates`);
  }
}
