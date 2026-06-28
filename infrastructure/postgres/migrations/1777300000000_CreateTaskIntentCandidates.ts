import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 任务意图候选层：将“用户这句话可能是任务”与“正式创建任务”解耦。
 */
export class CreateTaskIntentCandidates1777300000000 implements MigrationInterface {
  name = 'CreateTaskIntentCandidates1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_intent_candidates_room_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_task_intent_candidates_message`);
    await queryRunner.query(`DROP TABLE IF EXISTS task_intent_candidates`);
  }
}
