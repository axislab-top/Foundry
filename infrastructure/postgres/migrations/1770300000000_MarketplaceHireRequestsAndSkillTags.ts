import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 商城招聘审批 + 商品技能标签检索
 */
export class MarketplaceHireRequestsAndSkillTags1770300000000 implements MigrationInterface {
  name = 'MarketplaceHireRequestsAndSkillTags1770300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS skill_tags TEXT[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_skill_tags
      ON marketplace_agents USING GIN (skill_tags)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS marketplace_hire_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE RESTRICT,
        organization_node_id UUID NOT NULL REFERENCES organization_nodes(id) ON DELETE CASCADE,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_reason TEXT,
        reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP,
        reject_reason TEXT,
        purchase_event_id UUID,
        error_message TEXT,
        result_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_marketplace_hire_requests_status CHECK (
          status IN ('pending', 'approved', 'rejected', 'completed', 'failed')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_hire_requests_company_status
      ON marketplace_hire_requests(company_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_hire_requests_company_created
      ON marketplace_hire_requests(company_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_hire_pending_triple
      ON marketplace_hire_requests(company_id, marketplace_agent_id, organization_node_id)
      WHERE status = 'pending'
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_marketplace_hire_requests ON marketplace_hire_requests
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_marketplace_hire_requests ON marketplace_hire_requests
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_marketplace_hire_requests ON marketplace_hire_requests
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS marketplace_hire_requests`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_skill_tags`);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents DROP COLUMN IF EXISTS skill_tags
    `);
  }
}
