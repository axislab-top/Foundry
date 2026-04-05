import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollaborationTables1767875000000 implements MigrationInterface {
  name = 'AddCollaborationTables1767875000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        room_type VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        organization_node_id UUID NULL REFERENCES organization_nodes(id) ON DELETE SET NULL,
        task_id UUID NULL,
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        metadata JSONB NULL,
        message_seq BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_chat_rooms_type CHECK (
          room_type IN ('main', 'department', 'task', 'custom')
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_rooms_main_per_company
      ON chat_rooms(company_id)
      WHERE room_type = 'main'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_rooms_company ON chat_rooms(company_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_rooms_org_node ON chat_rooms(organization_node_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS room_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        member_type VARCHAR(16) NOT NULL,
        member_id UUID NOT NULL,
        joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP NULL,
        CONSTRAINT chk_room_members_type CHECK (member_type IN ('human', 'agent')),
        CONSTRAINT uq_room_members_active UNIQUE (room_id, member_type, member_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_room_members_company ON room_members(company_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        seq BIGINT NOT NULL,
        sender_type VARCHAR(16) NOT NULL,
        sender_id UUID NOT NULL,
        message_type VARCHAR(32) NOT NULL DEFAULT 'text',
        content TEXT NOT NULL DEFAULT '',
        metadata JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_chat_messages_sender CHECK (sender_type IN ('human', 'agent')),
        CONSTRAINT chk_chat_messages_msg_type CHECK (
          message_type IN ('text', 'system', 'tool_call', 'stream_chunk')
        ),
        CONSTRAINT uq_chat_messages_room_seq UNIQUE (room_id, seq)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_seq ON chat_messages(room_id, seq)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_company_created ON chat_messages(company_id, created_at)
    `);

    await queryRunner.query(`
      ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE chat_rooms FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_chat_rooms ON chat_rooms
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_chat_rooms ON chat_rooms
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE room_members ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE room_members FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_room_members ON room_members
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_room_members ON room_members
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_chat_messages ON chat_messages
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_chat_messages ON chat_messages
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_chat_messages ON chat_messages
    `);
    await queryRunner.query(`
      ALTER TABLE chat_messages NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_room_members ON room_members
    `);
    await queryRunner.query(`
      ALTER TABLE room_members NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE room_members DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_chat_rooms ON chat_rooms
    `);
    await queryRunner.query(`
      ALTER TABLE chat_rooms NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE chat_rooms DISABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS chat_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS room_members`);
    await queryRunner.query(`DROP TABLE IF EXISTS chat_rooms`);
  }
}
