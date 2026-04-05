import { MigrationInterface, QueryRunner } from 'typeorm';

export class SkillRevisionsAndArtifacts1769300000000 implements MigrationInterface {
  name = 'SkillRevisionsAndArtifacts1769300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_artifacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        skill_id UUID NULL REFERENCES skills(id) ON DELETE SET NULL,
        storage_path TEXT NOT NULL,
        sha256 VARCHAR(64) NULL,
        size_bytes BIGINT NULL,
        content_type VARCHAR(120) NULL,
        original_name VARCHAR(255) NULL,
        created_by_user_id UUID NULL,
        metadata JSONB NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_artifacts_company_created
      ON skill_artifacts(company_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_artifacts_skill_created
      ON skill_artifacts(skill_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_revisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
        version INT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'published',
        name VARCHAR(255) NOT NULL,
        category VARCHAR(120) NULL,
        description TEXT NULL,
        tool_schema JSONB NULL,
        prompt_template TEXT NULL,
        implementation_type VARCHAR(32) NOT NULL DEFAULT 'builtin',
        handler_config JSONB NULL,
        required_permissions JSONB NULL,
        is_public BOOLEAN NOT NULL DEFAULT true,
        is_system BOOLEAN NOT NULL DEFAULT false,
        metadata JSONB NULL,
        artifact_id UUID NULL REFERENCES skill_artifacts(id) ON DELETE SET NULL,
        created_by_user_id UUID NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_skill_revision_status CHECK (status IN ('draft', 'published', 'revoked')),
        CONSTRAINT chk_skill_revision_impl_type CHECK (implementation_type IN ('builtin', 'langgraph', 'api', 'external')),
        CONSTRAINT uq_skill_revision_version UNIQUE(skill_id, version)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_revisions_skill_status
      ON skill_revisions(skill_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_revisions_company_created
      ON skill_revisions(company_id, created_at)
    `);

    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS current_revision_id UUID NULL REFERENCES skill_revisions(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS published_revision_id UUID NULL REFERENCES skill_revisions(id) ON DELETE SET NULL
    `);

    // Backfill: create revision for existing skills (idempotent-ish).
    // Only create when no revisions exist for the skill.
    await queryRunner.query(`
      INSERT INTO skill_revisions (
        skill_id, company_id, version, status,
        name, category, description, tool_schema, prompt_template,
        implementation_type, handler_config, required_permissions,
        is_public, is_system, metadata
      )
      SELECT
        s.id, s.company_id, COALESCE(s.version, 1), 'published',
        s.name, s.category, s.description, s.tool_schema, s.prompt_template,
        s.implementation_type, s.handler_config,
        COALESCE(s.required_permissions, '[]'::jsonb),
        COALESCE(s.is_public, true), COALESCE(s.is_system, false), s.metadata
      FROM skills s
      WHERE NOT EXISTS (
        SELECT 1 FROM skill_revisions r WHERE r.skill_id = s.id
      )
    `);

    // Set pointers to latest revision per skill
    await queryRunner.query(`
      UPDATE skills s
      SET
        current_revision_id = x.id,
        published_revision_id = x.id
      FROM (
        SELECT DISTINCT ON (r.skill_id) r.skill_id, r.id
        FROM skill_revisions r
        WHERE r.status = 'published'
        ORDER BY r.skill_id, r.version DESC, r.created_at DESC
      ) x
      WHERE s.id = x.skill_id
        AND (s.published_revision_id IS NULL OR s.current_revision_id IS NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS published_revision_id`);
    await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS current_revision_id`);

    await queryRunner.query(`DROP TABLE IF EXISTS skill_revisions`);
    await queryRunner.query(`DROP TABLE IF EXISTS skill_artifacts`);
  }
}

