import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillRevisionReviewWorkflow1769302000000 implements MigrationInterface {
  name = 'AddSkillRevisionReviewWorkflow1769302000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      ADD COLUMN IF NOT EXISTS review_status VARCHAR(16) NOT NULL DEFAULT 'pending'
    `);
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      ADD COLUMN IF NOT EXISTS risk_level VARCHAR(16) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      ADD COLUMN IF NOT EXISTS scan_result JSONB NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      ADD COLUMN IF NOT EXISTS review_comment TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      DROP CONSTRAINT IF EXISTS chk_skill_revision_review_status
    `);
    await queryRunner.query(`
      ALTER TABLE skill_revisions
      ADD CONSTRAINT chk_skill_revision_review_status CHECK (review_status IN ('pending', 'approved', 'rejected'))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_revisions_review_status
      ON skill_revisions(review_status)
    `);

    // Existing published revisions are considered approved.
    await queryRunner.query(`
      UPDATE skill_revisions
      SET
        review_status = 'approved',
        reviewed_at = COALESCE(reviewed_at, created_at)
      WHERE status = 'published'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skill_revisions_review_status`);
    await queryRunner.query(`ALTER TABLE skill_revisions DROP CONSTRAINT IF EXISTS chk_skill_revision_review_status`);
    await queryRunner.query(`ALTER TABLE skill_revisions DROP COLUMN IF EXISTS reviewed_at`);
    await queryRunner.query(`ALTER TABLE skill_revisions DROP COLUMN IF EXISTS reviewed_by_user_id`);
    await queryRunner.query(`ALTER TABLE skill_revisions DROP COLUMN IF EXISTS review_comment`);
    await queryRunner.query(`ALTER TABLE skill_revisions DROP COLUMN IF EXISTS scan_result`);
    await queryRunner.query(`ALTER TABLE skill_revisions DROP COLUMN IF EXISTS risk_level`);
    await queryRunner.query(`ALTER TABLE skill_revisions DROP COLUMN IF EXISTS review_status`);
  }
}

