import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasswordResetTokens20260602120000 implements MigrationInterface {
  name = 'CreatePasswordResetTokens20260602120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "tokenHash" VARCHAR(128) NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "usedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_password_reset_tokens_userId"
        ON password_reset_tokens ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_password_reset_tokens_tokenHash"
        ON password_reset_tokens ("tokenHash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_password_reset_tokens_tokenHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_password_reset_tokens_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS password_reset_tokens`);
  }
}
