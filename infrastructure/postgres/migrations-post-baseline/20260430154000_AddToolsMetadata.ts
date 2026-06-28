import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddToolsMetadata20260430154000 implements MigrationInterface {
  name = 'AddToolsMetadata20260430154000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tools
      ADD COLUMN IF NOT EXISTS metadata JSONB NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tools
      DROP COLUMN IF EXISTS metadata
    `);
  }
}

