import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P19：每租户 Runner RuntimeClass 偏好（gVisor / Firecracker）；null 表示继承集群 RUNNER_DEFAULT_RUNTIME_CLASS。
 */
export class CompanyRuntimePreferences1775410000000 implements MigrationInterface {
  name = 'CompanyRuntimePreferences1775410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_runtime_preferences (
        company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        runtime_kind VARCHAR(16) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_company_runtime_preferences_kind CHECK (
          runtime_kind IN ('gvisor', 'firecracker')
        )
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE company_runtime_preferences IS 'P19：租户 Runner 隔离运行时偏好；无行=继承集群 RUNNER_DEFAULT_RUNTIME_CLASS'
    `);

    await queryRunner.query(`
      ALTER TABLE company_runtime_preferences ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_runtime_preferences FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_runtime_preferences
        ON company_runtime_preferences
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_company_runtime_preferences
        ON company_runtime_preferences
        USING (company_id = current_setting('app.current_tenant', true)::uuid)
        WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_runtime_preferences
        ON company_runtime_preferences
    `);
    await queryRunner.query(`
      ALTER TABLE company_runtime_preferences NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_runtime_preferences DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS company_runtime_preferences`);
  }
}
