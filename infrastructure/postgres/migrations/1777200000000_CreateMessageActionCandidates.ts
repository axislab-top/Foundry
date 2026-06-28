import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 将群聊消息后的“业务动作候选”从通用 job payload 中显式拆出，
 * 作为用户可见协作状态、任务候选、路由候选与内部 job 之间的稳定边界。
 */
export class CreateMessageActionCandidates1777200000000 implements MigrationInterface {
  name = 'CreateMessageActionCandidates1777200000000';

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
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_action_candidates_room_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_message_action_candidates_message`);
    await queryRunner.query(`DROP TABLE IF EXISTS message_action_candidates`);
  }
}
