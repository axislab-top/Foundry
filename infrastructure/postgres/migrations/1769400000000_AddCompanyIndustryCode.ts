import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyIndustryCode1769400000000 implements MigrationInterface {
  name = 'AddCompanyIndustryCode1769400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS industry_code VARCHAR(64)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_companies_industry_code ON companies(industry_code)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_companies_industry_code`);
    await queryRunner.query(`ALTER TABLE companies DROP COLUMN IF EXISTS industry_code`);
  }
}
