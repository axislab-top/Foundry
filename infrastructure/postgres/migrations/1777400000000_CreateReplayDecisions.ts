import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replay 决策表：记录基于上下文的流程推进判断，避免单条消息策略直接决定执行化。
 */
export class CreateReplayDecisions1777400000000 implements MigrationInterface {
  name = 'CreateReplayDecisions1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  }
}
