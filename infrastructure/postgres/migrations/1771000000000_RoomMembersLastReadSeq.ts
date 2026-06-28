import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoomMembersLastReadSeq1771000000000 implements MigrationInterface {
  name = 'RoomMembersLastReadSeq1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE room_members
      ADD COLUMN IF NOT EXISTS last_read_seq BIGINT NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE room_members
      DROP COLUMN IF EXISTS last_read_seq
    `);
  }
}
