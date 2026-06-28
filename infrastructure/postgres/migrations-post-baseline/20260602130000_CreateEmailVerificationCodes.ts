import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmailVerificationCodes20260602130000 implements MigrationInterface {
  name = 'CreateEmailVerificationCodes20260602130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        purpose VARCHAR(32) NOT NULL DEFAULT 'register',
        "codeHash" VARCHAR(128) NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_verification_codes_email_purpose"
        ON email_verification_codes (email, purpose)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_verification_codes_expiresAt"
        ON email_verification_codes ("expiresAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_verification_codes_expiresAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_verification_codes_email_purpose"`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_verification_codes`);
  }
}
