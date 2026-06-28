import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollaborationProgramsGoalUnderstanding20260617140000 implements MigrationInterface {
  name = 'AddCollaborationProgramsGoalUnderstanding20260617140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE collaboration_programs
      ADD COLUMN IF NOT EXISTS goal_understanding JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE collaboration_programs
      DROP COLUMN IF EXISTS goal_understanding
    `);
  }
}
