import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M5：结构化教训持久化 + 重复失败度量；RLS 与 companies 对齐。
 */
export class M5SupervisorLessons1770900000000 implements MigrationInterface {
  name = 'M5SupervisorLessons1770900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supervisor_lessons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        run_id UUID NOT NULL,
        task_id UUID NULL,
        failure_signature_hash VARCHAR(64) NOT NULL,
        root_cause TEXT NOT NULL,
        lesson TEXT NOT NULL,
        preventive_action TEXT NOT NULL,
        confidence REAL NOT NULL,
        impact_on_budget_or_roi REAL NULL,
        ingested_to_memory BOOLEAN NOT NULL DEFAULT false,
        is_repeat_pattern BOOLEAN NOT NULL DEFAULT false,
        memory_entry_id UUID NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_supervisor_lessons_run FOREIGN KEY (run_id) REFERENCES task_runs(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_supervisor_lessons_company_created
      ON supervisor_lessons(company_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_supervisor_lessons_company_hash
      ON supervisor_lessons(company_id, failure_signature_hash)
    `);

    await queryRunner.query(`
      ALTER TABLE supervisor_lessons ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      CREATE POLICY supervisor_lessons_tenant_isolation ON supervisor_lessons
      FOR ALL
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS supervisor_lessons_tenant_isolation ON supervisor_lessons`);
    await queryRunner.query(`DROP TABLE IF EXISTS supervisor_lessons`);
  }
}
