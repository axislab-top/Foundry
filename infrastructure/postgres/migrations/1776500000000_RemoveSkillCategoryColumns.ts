import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSkillCategoryColumns1776500000000 implements MigrationInterface {
  name = 'RemoveSkillCategoryColumns1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      DROP COLUMN IF EXISTS category
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      DROP COLUMN IF EXISTS category
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS category VARCHAR(120) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      ADD COLUMN IF NOT EXISTS category VARCHAR(120) NULL
    `);
  }
}
