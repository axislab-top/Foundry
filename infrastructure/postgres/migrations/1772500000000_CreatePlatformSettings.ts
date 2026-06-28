import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformSettings1772500000000 implements MigrationInterface {
  name = 'CreatePlatformSettings1772500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key varchar(80) PRIMARY KEY,
        value jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      COMMENT ON TABLE platform_settings IS '平台级配置（键值/JSON）';
      COMMENT ON COLUMN platform_settings.key IS '配置键';
      COMMENT ON COLUMN platform_settings.value IS '配置值（JSON）';
      COMMENT ON COLUMN platform_settings.updated_at IS '更新时间';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS platform_settings;`);
  }
}

