import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupLegacyHeartbeatConfigs1776000000000 implements MigrationInterface {
  name = 'CleanupLegacyHeartbeatConfigs1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'company_heartbeat_configs'
        ) THEN
          COMMENT ON TABLE company_heartbeat_configs IS 'DEPRECATED: legacy heartbeat config table; CEO decision config must read ceoLayerConfig only';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      -- Safeguard cleanup: remove legacy shadow table if it exists.
      DROP TABLE IF EXISTS company_heartbeat_configs_legacy
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- rollback no-op for legacy shadow table drop
      SELECT 1
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'company_heartbeat_configs'
        ) THEN
          COMMENT ON TABLE company_heartbeat_configs IS NULL;
        END IF;
      END $$;
    `);
  }
}

