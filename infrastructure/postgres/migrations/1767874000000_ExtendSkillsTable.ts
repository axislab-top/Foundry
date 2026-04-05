import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendSkillsTable1767874000000 implements MigrationInterface {
  name = 'ExtendSkillsTable1767874000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS description TEXT NULL`);
    await queryRunner.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS handler_config JSONB NULL`);
    await queryRunner.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS required_permissions JSONB NULL`);
    await queryRunner.query(
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false`,
    );

    await queryRunner.query(`
      UPDATE skills SET required_permissions = '[]'::jsonb WHERE required_permissions IS NULL
    `);

    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS permissions`);

    await queryRunner.query(`ALTER TABLE skills DROP CONSTRAINT IF EXISTS chk_skills_impl_type`);
    await queryRunner.query(`
      ALTER TABLE skills ADD CONSTRAINT chk_skills_impl_type
      CHECK (implementation_type IN ('builtin', 'langgraph', 'api', 'external'))
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_global_name
      ON skills (name) WHERE company_id IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_company_name
      ON skills (company_id, name) WHERE company_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_company_name`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_global_name`);

    await queryRunner.query(`ALTER TABLE skills DROP CONSTRAINT IF EXISTS chk_skills_impl_type`);
    await queryRunner.query(`
      ALTER TABLE skills ADD CONSTRAINT chk_skills_impl_type
      CHECK (implementation_type IN ('builtin', 'langgraph', 'api'))
    `);

    await queryRunner.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS permissions JSONB NULL`);
    await queryRunner.query(`
      UPDATE skills SET permissions = jsonb_build_object('required', COALESCE(required_permissions, '[]'::jsonb))
    `);

    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS description`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS handler_config`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS required_permissions`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS version`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS is_public`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS is_system`);
  }
}
