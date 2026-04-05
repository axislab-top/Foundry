import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 群聊 Agent 回复可附带引用的记忆条目 id（审计 / HIL / 前端展示来源）。
 */
export class ChatMessageMemoryReferences1770200000000 implements MigrationInterface {
  name = 'ChatMessageMemoryReferences1770200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS memory_references JSONB
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_memory_references_gin
      ON chat_messages USING GIN (memory_references jsonb_path_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_chat_messages_memory_references_gin
    `);
    await queryRunner.query(`
      ALTER TABLE chat_messages DROP COLUMN IF EXISTS memory_references
    `);
  }
}
