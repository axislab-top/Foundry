import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyIdToAuditLogs1767866000000
  implements MigrationInterface
{
  name = 'AddCompanyIdToAuditLogs1767866000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS company_id UUID
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id
      ON audit_logs(company_id)
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN audit_logs.company_id IS '公司ID（租户上下文）'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_audit_logs_company_id
    `);

    await queryRunner.query(`
      ALTER TABLE audit_logs
      DROP COLUMN IF EXISTS company_id
    `);
  }
}
