import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompanyDailyBriefSnapshots20260603120000 implements MigrationInterface {
  name = 'CreateCompanyDailyBriefSnapshots20260603120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_daily_brief_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        brief_date date NOT NULL,
        source varchar(32) NOT NULL,
        summary_text text NOT NULL,
        metrics jsonb NULL,
        heartbeat_run_id uuid NULL,
        metadata jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_daily_brief_company_date UNIQUE (company_id, brief_date)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_brief_company_date
      ON company_daily_brief_snapshots (company_id, brief_date DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS company_daily_brief_snapshots`);
  }
}
