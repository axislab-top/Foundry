import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align tasks table with Task entity:
 * add nullable approval_flow_id used by advanced approval binding.
 */
export class AddTaskApprovalFlowId1772200000000 implements MigrationInterface {
  name = 'AddTaskApprovalFlowId1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS approval_flow_id UUID
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_company_approval_flow
      ON tasks(company_id, approval_flow_id)
      WHERE approval_flow_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_tasks_company_approval_flow
    `);

    await queryRunner.query(`
      ALTER TABLE tasks
      DROP COLUMN IF EXISTS approval_flow_id
    `);
  }
}

