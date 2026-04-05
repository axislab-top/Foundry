import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendCompaniesForCompaniesModule1767867000000
  implements MigrationInterface
{
  name = 'ExtendCompaniesForCompaniesModule1767867000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS slug VARCHAR(120),
      ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32),
      ADD COLUMN IF NOT EXISTS timezone VARCHAR(64),
      ADD COLUMN IF NOT EXISTS default_language VARCHAR(16)
    `);

    await queryRunner.query(`
      UPDATE companies
      SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
      WHERE slug IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug_unique ON companies(slug)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_companies_slug_unique
    `);

    await queryRunner.query(`
      ALTER TABLE companies
      DROP COLUMN IF EXISTS default_language,
      DROP COLUMN IF EXISTS timezone,
      DROP COLUMN IF EXISTS contact_phone,
      DROP COLUMN IF EXISTS contact_email,
      DROP COLUMN IF EXISTS logo_url,
      DROP COLUMN IF EXISTS description,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS slug
    `);
  }
}
