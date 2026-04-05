import { MigrationInterface, QueryRunner } from 'typeorm';

export class CollaborationMultiModeThreads1770000000000 implements MigrationInterface {
  name = 'CollaborationMultiModeThreads1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_rooms
      ADD COLUMN IF NOT EXISTS collaboration_mode VARCHAR(32) NOT NULL DEFAULT 'discussion'
    `);
    await queryRunner.query(`
      ALTER TABLE chat_rooms
      ADD CONSTRAINT chk_chat_rooms_collaboration_mode CHECK (
        collaboration_mode IN ('discussion', 'direct', 'execution', 'approval_wait')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS discussion_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        title VARCHAR(512) NOT NULL DEFAULT '',
        status VARCHAR(32) NOT NULL DEFAULT 'open',
        collaboration_mode VARCHAR(32) NULL,
        langgraph_thread_id VARCHAR(512) NULL,
        round_count INT NOT NULL DEFAULT 0,
        metadata JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_discussion_threads_status CHECK (status IN ('open', 'converged', 'archived')),
        CONSTRAINT chk_discussion_threads_collab_mode CHECK (
          collaboration_mode IS NULL OR collaboration_mode IN ('discussion', 'direct', 'execution', 'approval_wait')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_discussion_threads_room ON discussion_threads(room_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_discussion_threads_company ON discussion_threads(company_id)
    `);

    await queryRunner.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS thread_id UUID NULL REFERENCES discussion_threads(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id)
    `);

    await queryRunner.query(`
      ALTER TABLE discussion_threads ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE discussion_threads FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_discussion_threads ON discussion_threads
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_discussion_threads ON discussion_threads
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_discussion_threads ON discussion_threads
    `);
    await queryRunner.query(`
      ALTER TABLE discussion_threads NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE discussion_threads DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_chat_messages_thread
    `);
    await queryRunner.query(`
      ALTER TABLE chat_messages DROP COLUMN IF EXISTS thread_id
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS discussion_threads`);

    await queryRunner.query(`
      ALTER TABLE chat_rooms DROP CONSTRAINT IF EXISTS chk_chat_rooms_collaboration_mode
    `);
    await queryRunner.query(`
      ALTER TABLE chat_rooms DROP COLUMN IF EXISTS collaboration_mode
    `);
  }
}
