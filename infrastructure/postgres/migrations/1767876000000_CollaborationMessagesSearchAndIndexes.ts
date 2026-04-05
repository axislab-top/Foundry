import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 协作消息：全文检索（simple 配置）+ sender 查询索引
 */
export class CollaborationMessagesSearchAndIndexes1767876000000
  implements MigrationInterface
{
  name = 'CollaborationMessagesSearchAndIndexes1767876000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS content_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_content_tsv
      ON chat_messages USING GIN (content_tsv)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_sender
      ON chat_messages(room_id, sender_type, sender_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_chat_messages_room_sender
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_chat_messages_content_tsv
    `);
    await queryRunner.query(`
      ALTER TABLE chat_messages DROP COLUMN IF EXISTS content_tsv
    `);
  }
}
