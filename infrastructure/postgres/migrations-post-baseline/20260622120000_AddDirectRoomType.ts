import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * chat_rooms.room_type CHECK 约束缺少 'direct'（私聊房间类型），
 * 导致创建 direct 类型房间时违反 chk_chat_rooms_type 约束。
 * 此迁移删除旧约束并重建，新增 'direct' 合法值。
 */
export class AddDirectRoomType20260622120000 implements MigrationInterface {
  name = 'AddDirectRoomType20260622120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_rooms
      DROP CONSTRAINT IF EXISTS chk_chat_rooms_type
    `);
    await queryRunner.query(`
      ALTER TABLE chat_rooms
      ADD CONSTRAINT chk_chat_rooms_type CHECK (
        room_type IN ('main', 'department', 'task', 'custom', 'direct')
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_rooms
      DROP CONSTRAINT IF EXISTS chk_chat_rooms_type
    `);
    await queryRunner.query(`
      ALTER TABLE chat_rooms
      ADD CONSTRAINT chk_chat_rooms_type CHECK (
        room_type IN ('main', 'department', 'task', 'custom')
      )
    `);
  }
}
