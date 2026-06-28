import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Application layer accepts prompt/mcp (Skill entity, @foundry/skill-md, Admin SKILL.md template)
 * but DB check constraints were still limited to builtin/langgraph/api/external.
 */
export class ExtendSkillImplementationTypeConstraint20260605120000 implements MigrationInterface {
  name = 'ExtendSkillImplementationTypeConstraint20260605120000';

  private readonly allowed = ['prompt', 'builtin', 'langgraph', 'api', 'external', 'mcp'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const list = this.allowed.map((v) => `'${v}'`).join(', ');

    await queryRunner.query(`ALTER TABLE skills DROP CONSTRAINT IF EXISTS chk_skills_impl_type`);
    await queryRunner.query(`
      ALTER TABLE skills ADD CONSTRAINT chk_skills_impl_type
      CHECK (implementation_type IN (${list}))
    `);

    await queryRunner.query(
      `ALTER TABLE skill_revisions DROP CONSTRAINT IF EXISTS chk_skill_revision_impl_type`,
    );
    await queryRunner.query(`
      ALTER TABLE skill_revisions ADD CONSTRAINT chk_skill_revision_impl_type
      CHECK (implementation_type IN (${list}))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const legacy = ['builtin', 'langgraph', 'api', 'external'];
    const legacyList = legacy.map((v) => `'${v}'`).join(', ');

    await queryRunner.query(`ALTER TABLE skills DROP CONSTRAINT IF EXISTS chk_skills_impl_type`);
    await queryRunner.query(`
      ALTER TABLE skills ADD CONSTRAINT chk_skills_impl_type
      CHECK (implementation_type IN (${legacyList}))
    `);

    await queryRunner.query(
      `ALTER TABLE skill_revisions DROP CONSTRAINT IF EXISTS chk_skill_revision_impl_type`,
    );
    await queryRunner.query(`
      ALTER TABLE skill_revisions ADD CONSTRAINT chk_skill_revision_impl_type
      CHECK (implementation_type IN (${legacyList}))
    `);
  }
}
