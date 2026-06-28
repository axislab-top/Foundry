import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationManagementChainIndexes1771300000000 implements MigrationInterface {
  name = 'OrganizationManagementChainIndexes1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_nodes_company_parent_agent_not_null
      ON organization_nodes(company_id, parent_id, agent_id)
      WHERE agent_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_nodes_company_parent_type
      ON organization_nodes(company_id, parent_id, type)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_org_nodes_company_parent_type
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_org_nodes_company_parent_agent_not_null
    `);
  }
}

