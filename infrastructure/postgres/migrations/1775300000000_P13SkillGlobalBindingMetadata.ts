import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P13：为平台全局 Skill（company_id IS NULL）显式标记 metadata.isGlobal，
 * 使其可在未写入 organization_node_skills 的情况下仍被公司级绑定校验视为「已放行」。
 * 收紧治理时可在后台将单个 Skill 的 metadata.isGlobal 置为 false，并改为仅通过公司组织节点绑定使用。
 */
export class P13SkillGlobalBindingMetadata1775300000000 implements MigrationInterface {
  name = 'P13SkillGlobalBindingMetadata1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE skills
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{isGlobal}',
        'true'::jsonb,
        true
      )
      WHERE company_id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE skills
      SET metadata = (metadata - 'isGlobal')
      WHERE company_id IS NULL
        AND metadata IS NOT NULL
        AND (metadata ? 'isGlobal')
    `);
  }
}
