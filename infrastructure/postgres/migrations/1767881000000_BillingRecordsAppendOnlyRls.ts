import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * billing_records：仅允许 SELECT + INSERT（RLS），禁止应用角色 UPDATE/DELETE，满足「计费记录不可篡改」。
 */
export class BillingRecordsAppendOnlyRls1767881000000 implements MigrationInterface {
  name = 'BillingRecordsAppendOnlyRls1767881000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_billing_records ON billing_records
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_select_billing_records ON billing_records
      FOR SELECT
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_insert_billing_records ON billing_records
      FOR INSERT
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_select_billing_records ON billing_records
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_insert_billing_records ON billing_records
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_billing_records ON billing_records
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }
}
