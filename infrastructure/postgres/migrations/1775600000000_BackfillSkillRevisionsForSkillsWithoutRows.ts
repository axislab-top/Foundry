import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Skills inserted after `SkillRevisionsAndArtifacts1769300000000` never received a backfilled
 * `skill_revisions` row, so `findPublishedRevisionsBySkillIdsForTenant` returns nothing and
 * `agents.effectiveSkillSnapshots` lists zero skills despite `agent_skills` bindings.
 */
export class BackfillSkillRevisionsForSkillsWithoutRows1775600000000 implements MigrationInterface {
  name = 'BackfillSkillRevisionsForSkillsWithoutRows1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO skill_revisions (
        skill_id, company_id, version, status, review_status, reviewed_at,
        name, category, description, tool_schema, prompt_template,
        implementation_type, handler_config, required_permissions,
        is_public, is_system, metadata
      )
      SELECT
        s.id,
        s.company_id,
        COALESCE(s.version, 1),
        'published',
        'approved',
        NOW(),
        s.name,
        s.category,
        s.description,
        s.tool_schema,
        s.prompt_template,
        s.implementation_type,
        s.handler_config,
        COALESCE(s.required_permissions, '[]'::jsonb),
        COALESCE(s.is_public, true),
        COALESCE(s.is_system, false),
        s.metadata
      FROM skills s
      WHERE NOT EXISTS (SELECT 1 FROM skill_revisions r WHERE r.skill_id = s.id)
    `);

    await queryRunner.query(`
      UPDATE skills s
      SET
        current_revision_id = x.id,
        published_revision_id = x.id
      FROM (
        SELECT DISTINCT ON (r.skill_id) r.skill_id, r.id
        FROM skill_revisions r
        WHERE r.status = 'published' AND r.review_status = 'approved'
        ORDER BY r.skill_id, r.version DESC, r.created_at DESC
      ) x
      WHERE s.id = x.skill_id
        AND (s.published_revision_id IS NULL OR s.current_revision_id IS NULL)
    `);
  }

  public async down(): Promise<void> {
    // Intentionally empty: cannot safely delete revisions that may have been edited post-backfill.
  }
}
