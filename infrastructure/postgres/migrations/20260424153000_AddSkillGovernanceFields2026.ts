import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillGovernanceFields202620260424153000 implements MigrationInterface {
  name = 'AddSkillGovernanceFields202620260424153000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS max_input_tokens INT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS max_output_tokens INT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS max_input_size_bytes INT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS timeout_seconds INT NULL DEFAULT 300
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS chunk_strategy VARCHAR(16) NULL DEFAULT 'none'
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS category JSONB NULL
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      ADD COLUMN IF NOT EXISTS icon TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skills
      DROP COLUMN IF EXISTS icon
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      DROP COLUMN IF EXISTS category
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      DROP COLUMN IF EXISTS chunk_strategy
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      DROP COLUMN IF EXISTS timeout_seconds
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      DROP COLUMN IF EXISTS max_input_size_bytes
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      DROP COLUMN IF EXISTS max_output_tokens
    `);
    await queryRunner.query(`
      ALTER TABLE skills
      DROP COLUMN IF EXISTS max_input_tokens
    `);
  }
}

