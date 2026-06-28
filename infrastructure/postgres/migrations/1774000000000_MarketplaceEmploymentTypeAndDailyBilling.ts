import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace hire: permanent vs temporary (task/project scoped) + subscription daily billing.
 */
export class MarketplaceEmploymentTypeAndDailyBilling1774000000000 implements MigrationInterface {
  name = 'MarketplaceEmploymentTypeAndDailyBilling1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      ADD COLUMN IF NOT EXISTS employment_type VARCHAR(16) NOT NULL DEFAULT 'permanent'
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES tasks(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      DROP CONSTRAINT IF EXISTS chk_marketplace_hire_requests_employment_type
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      ADD CONSTRAINT chk_marketplace_hire_requests_employment_type CHECK (
        employment_type IN ('permanent', 'temporary')
      )
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      DROP CONSTRAINT IF EXISTS chk_marketplace_hire_requests_temp_requires_project
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      ADD CONSTRAINT chk_marketplace_hire_requests_temp_requires_project CHECK (
        (employment_type = 'temporary' AND project_id IS NOT NULL)
        OR (employment_type = 'permanent')
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_hire_requests_company_employment
      ON marketplace_hire_requests(company_id, employment_type, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS marketplace_agent_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE RESTRICT,
        organization_node_id UUID REFERENCES organization_nodes(id) ON DELETE SET NULL,
        agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
        employment_type VARCHAR(16) NOT NULL DEFAULT 'permanent',
        project_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        daily_price_cents INT NOT NULL DEFAULT 0,
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        started_on DATE NOT NULL DEFAULT CURRENT_DATE,
        ended_on DATE,
        last_billed_on DATE,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_marketplace_agent_subscriptions_status CHECK (
          status IN ('active', 'cancelled')
        ),
        CONSTRAINT chk_marketplace_agent_subscriptions_employment_type CHECK (
          employment_type IN ('permanent', 'temporary')
        ),
        CONSTRAINT chk_marketplace_agent_subscriptions_temp_requires_project CHECK (
          (employment_type = 'temporary' AND project_id IS NOT NULL)
          OR (employment_type = 'permanent')
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agent_subscriptions_company_status
      ON marketplace_agent_subscriptions(company_id, status)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_agent_subscriptions_active_slot
      ON marketplace_agent_subscriptions(company_id, marketplace_agent_id, organization_node_id)
      WHERE status = 'active'
    `);

    await queryRunner.query(`
      ALTER TABLE marketplace_agent_subscriptions ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agent_subscriptions FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_marketplace_agent_subscriptions ON marketplace_agent_subscriptions
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_marketplace_agent_subscriptions ON marketplace_agent_subscriptions
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_marketplace_agent_subscriptions ON marketplace_agent_subscriptions
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agent_subscriptions NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agent_subscriptions DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS marketplace_agent_subscriptions`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_hire_requests_company_employment`);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      DROP CONSTRAINT IF EXISTS chk_marketplace_hire_requests_temp_requires_project
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      DROP CONSTRAINT IF EXISTS chk_marketplace_hire_requests_employment_type
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      DROP COLUMN IF EXISTS project_id
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_hire_requests
      DROP COLUMN IF EXISTS employment_type
    `);
  }
}

