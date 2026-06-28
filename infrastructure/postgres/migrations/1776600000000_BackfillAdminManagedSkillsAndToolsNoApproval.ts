import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill legacy approval fields after switching admin-managed skills/tools
 * to direct-effective updates (no approval workflow).
 */
export class BackfillAdminManagedSkillsAndToolsNoApproval1776600000000 implements MigrationInterface {
  name = 'BackfillAdminManagedSkillsAndToolsNoApproval1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE skills
      SET
        approval_status = 'none',
        approval_request_id = NULL
      WHERE approval_status <> 'none' OR approval_request_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE mcp_tools
      SET
        approval_status = 'none',
        approval_request_id = NULL
      WHERE approval_status <> 'none' OR approval_request_id IS NOT NULL
    `);
  }

  public async down(): Promise<void> {
    // Intentionally irreversible: historical approval state cannot be reconstructed.
  }
}

