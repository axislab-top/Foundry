import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventIdempotencyKeys1771400000000 implements MigrationInterface {
  name = 'EventIdempotencyKeys1771400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS event_idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        event_type VARCHAR(80) NOT NULL,
        idempotency_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_event_idempotency_company_event_key
      ON event_idempotency_keys(company_id, event_type, idempotency_key)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_event_idempotency_company_created
      ON event_idempotency_keys(company_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_event_idempotency_company_created
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_event_idempotency_company_event_key
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS event_idempotency_keys
    `);
  }
}
