import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 允许在设置 app.membership_listing_user（事务级）时，按成员关系读取 companies / company_memberships，
 * 用于「尚未选择 x-company-id」时列出当前用户可访问公司列表。
 */
export class CompanyListRlsForMembershipScope1767884000000
  implements MigrationInterface
{
  name = 'CompanyListRlsForMembershipScope1767884000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_companies ON companies
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_companies ON companies
      USING (
        id = current_setting('app.current_tenant', true)::uuid
        OR
        EXISTS (
          SELECT 1 FROM company_memberships m
          WHERE m.company_id = companies.id
            AND m.user_id = current_setting('app.membership_listing_user', true)::uuid
            AND m.is_active = true
        )
      )
      WITH CHECK (
        id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_memberships ON company_memberships
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_memberships ON company_memberships
      USING (
        company_id = current_setting('app.current_tenant', true)::uuid
        OR
        user_id = current_setting('app.membership_listing_user', true)::uuid
      )
      WITH CHECK (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_memberships ON company_memberships
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_memberships ON company_memberships
      USING (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_companies ON companies
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_companies ON companies
      USING (
        id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        id = current_setting('app.current_tenant', true)::uuid
      )
    `);
  }
}
