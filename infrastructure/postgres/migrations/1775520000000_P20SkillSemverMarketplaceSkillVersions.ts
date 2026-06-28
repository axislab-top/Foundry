import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P20：平台 Global Skill 的 **semver 行级版本**（与 int `version` 修订号并存）、
 * `marketplace_agents.recommended_skill_version_ids` 显式钉版本；约束「同名全局仅一条 is_latest」。
 */
export class P20SkillSemverMarketplaceSkillVersions1775520000000 implements MigrationInterface {
  name = 'P20SkillSemverMarketplaceSkillVersions1775520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skills
        ADD COLUMN IF NOT EXISTS semver_version varchar(64) NOT NULL DEFAULT '1.0.0',
        ADD COLUMN IF NOT EXISTS is_latest boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS changelog text NULL
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY name
                 ORDER BY created_at DESC NULLS LAST, id
               ) AS rn
        FROM skills
        WHERE company_id IS NULL
      )
      UPDATE skills s
      SET is_latest = (r.rn = 1)
      FROM ranked r
      WHERE s.id = r.id AND s.company_id IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_global_name_one_latest
      ON skills (name)
      WHERE company_id IS NULL AND is_latest = true
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agents
        ADD COLUMN IF NOT EXISTS recommended_skill_version_ids uuid[] NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
        DROP COLUMN IF EXISTS recommended_skill_version_ids
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_global_name_one_latest`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS changelog`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS is_latest`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS semver_version`);
  }
}
