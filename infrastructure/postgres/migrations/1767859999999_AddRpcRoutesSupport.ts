import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRpcRoutesSupport1767859999999 implements MigrationInterface {
  name = 'AddRpcRoutesSupport1767859999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE routes
        ADD COLUMN IF NOT EXISTS transport VARCHAR(16) NOT NULL DEFAULT 'http',
        ADD COLUMN IF NOT EXISTS rpc_client_name VARCHAR(32),
        ADD COLUMN IF NOT EXISTS rpc_pattern VARCHAR(128),
        ADD COLUMN IF NOT EXISTS rpc_timeout_ms INTEGER
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routes_transport ON routes(transport)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_routes_rpc_pattern ON routes(rpc_pattern)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_routes_rpc_pattern`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_routes_transport`);
    await queryRunner.query(`
      ALTER TABLE routes
        DROP COLUMN IF EXISTS rpc_timeout_ms,
        DROP COLUMN IF EXISTS rpc_pattern,
        DROP COLUMN IF EXISTS rpc_client_name,
        DROP COLUMN IF EXISTS transport
    `);
  }
}

