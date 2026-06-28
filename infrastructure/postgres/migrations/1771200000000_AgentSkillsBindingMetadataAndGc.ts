import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentSkillsBindingMetadataAndGc1771200000000 implements MigrationInterface {
  name = 'AgentSkillsBindingMetadataAndGc1771200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE agent_skills
      ADD COLUMN IF NOT EXISTS source VARCHAR(120) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE agent_skills
      ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE agent_skills
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_skills_company_temporary_expires
      ON agent_skills(company_id, expires_at)
      WHERE is_temporary = true AND expires_at IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_skills_source
      ON agent_skills(source)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agent_skills_source
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agent_skills_company_temporary_expires
    `);
    await queryRunner.query(`
      ALTER TABLE agent_skills DROP COLUMN IF EXISTS expires_at
    `);
    await queryRunner.query(`
      ALTER TABLE agent_skills DROP COLUMN IF EXISTS is_temporary
    `);
    await queryRunner.query(`
      ALTER TABLE agent_skills DROP COLUMN IF EXISTS source
    `);
  }
}

