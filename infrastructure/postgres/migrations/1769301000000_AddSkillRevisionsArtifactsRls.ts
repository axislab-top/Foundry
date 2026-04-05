import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillRevisionsArtifactsRls1769301000000 implements MigrationInterface {
  name = 'AddSkillRevisionsArtifactsRls1769301000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE skill_revisions ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_revisions FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_read_global_skill_revisions ON skill_revisions`);
    await queryRunner.query(`
      CREATE POLICY tenant_read_global_skill_revisions ON skill_revisions
      FOR SELECT
      USING (
        company_id IS NULL
        OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_write_company_skill_revisions ON skill_revisions`);
    await queryRunner.query(`
      CREATE POLICY tenant_write_company_skill_revisions ON skill_revisions
      FOR ALL
      USING (
        company_id IS NOT NULL
        AND company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NOT NULL
        AND company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);

    await queryRunner.query(`ALTER TABLE skill_artifacts ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_artifacts FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_read_global_skill_artifacts ON skill_artifacts`);
    await queryRunner.query(`
      CREATE POLICY tenant_read_global_skill_artifacts ON skill_artifacts
      FOR SELECT
      USING (
        company_id IS NULL
        OR company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_write_company_skill_artifacts ON skill_artifacts`);
    await queryRunner.query(`
      CREATE POLICY tenant_write_company_skill_artifacts ON skill_artifacts
      FOR ALL
      USING (
        company_id IS NOT NULL
        AND company_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        company_id IS NOT NULL
        AND company_id = current_setting('app.current_tenant', true)::uuid
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_write_company_skill_artifacts ON skill_artifacts`);
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_read_global_skill_artifacts ON skill_artifacts`);
    await queryRunner.query(`ALTER TABLE skill_artifacts NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_artifacts DISABLE ROW LEVEL SECURITY`);

    await queryRunner.query(`DROP POLICY IF EXISTS tenant_write_company_skill_revisions ON skill_revisions`);
    await queryRunner.query(`DROP POLICY IF EXISTS tenant_read_global_skill_revisions ON skill_revisions`);
    await queryRunner.query(`ALTER TABLE skill_revisions NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE skill_revisions DISABLE ROW LEVEL SECURITY`);
  }
}

