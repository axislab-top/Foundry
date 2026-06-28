import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentSkillsVersionColumns20260501170000 implements MigrationInterface {
  name = 'AddAgentSkillsVersionColumns20260501170000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE agent_skills
      ADD COLUMN IF NOT EXISTS version integer NULL
    `);

    await queryRunner.query(`
      ALTER TABLE agent_skills
      ADD COLUMN IF NOT EXISTS semver_version varchar(32) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_skills_company_skill_version
      ON agent_skills (company_id, skill_id, version)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agent_skills_company_skill_version
    `);

    await queryRunner.query(`
      ALTER TABLE agent_skills
      DROP COLUMN IF EXISTS semver_version
    `);

    await queryRunner.query(`
      ALTER TABLE agent_skills
      DROP COLUMN IF EXISTS version
    `);
  }
}

