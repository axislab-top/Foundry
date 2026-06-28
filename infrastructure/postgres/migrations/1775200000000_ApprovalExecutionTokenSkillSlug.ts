import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P12：Runner 技能绑定的一次性执行令牌须记录 skill_slug，便于 API 消费时与 Runner.skill.execute 二次校验对齐。
 */
export class ApprovalExecutionTokenSkillSlug1775200000000 implements MigrationInterface {
  name = 'ApprovalExecutionTokenSkillSlug1775200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE approval_execution_tokens
      ADD COLUMN IF NOT EXISTS skill_slug VARCHAR(128) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE approval_execution_tokens
      DROP COLUMN IF EXISTS skill_slug
    `);
  }
}
