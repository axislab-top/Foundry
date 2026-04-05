import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace Agent 增强：
 * - marketplace_agents.bound_model_name：商品固定绑定的模型（单选）
 * - marketplace_agent_key_bindings：商品绑定的全局 LLM Key 列表 + 优先级（sort_order）
 *   - llm_key_id 全局唯一（跨商品不允许复用 key）
 * - company_marketplace_agent_key_assignments：公司购买后分配到的固定 key（每公司每商品 1 个）
 * - agents.llm_key_id：运行时 Agent 固定使用的 key（可空，兼容历史/模板导入）
 */
export class MarketplaceAgentModelAndKeyAssignments1768001000000
  implements MigrationInterface
{
  name = 'MarketplaceAgentModelAndKeyAssignments1768001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_agents
      ADD COLUMN IF NOT EXISTS bound_model_name VARCHAR(120)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_bound_model_name
      ON marketplace_agents(bound_model_name)
      WHERE bound_model_name IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS marketplace_agent_key_bindings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
        llm_key_id UUID NOT NULL REFERENCES llm_keys(id) ON DELETE RESTRICT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_marketplace_agent_key_bindings_agent_key UNIQUE (marketplace_agent_id, llm_key_id),
        CONSTRAINT uq_marketplace_agent_key_bindings_llm_key UNIQUE (llm_key_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agent_key_bindings_agent_sort
      ON marketplace_agent_key_bindings(marketplace_agent_id, sort_order ASC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_marketplace_agent_key_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
        assigned_llm_key_id UUID NOT NULL REFERENCES llm_keys(id) ON DELETE RESTRICT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_company_marketplace_agent UNIQUE (company_id, marketplace_agent_id),
        CONSTRAINT uq_company_marketplace_assigned_llm_key UNIQUE (assigned_llm_key_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_marketplace_agent_assignments_company
      ON company_marketplace_agent_key_assignments(company_id)
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_marketplace_agent_key_assignments
      ON company_marketplace_agent_key_assignments
    `);
    await queryRunner.query(`
      CREATE POLICY company_isolation_on_company_marketplace_agent_key_assignments
      ON company_marketplace_agent_key_assignments
      USING (company_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_tenant', true)::uuid)
    `);

    await queryRunner.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS llm_key_id UUID REFERENCES llm_keys(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_company_llm_key
      ON agents(company_id, llm_key_id)
      WHERE llm_key_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_agents_company_llm_key
    `);
    await queryRunner.query(`
      ALTER TABLE agents DROP COLUMN IF EXISTS llm_key_id
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS company_isolation_on_company_marketplace_agent_key_assignments
      ON company_marketplace_agent_key_assignments
    `);
    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments NO FORCE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments DISABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS company_marketplace_agent_key_assignments
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS marketplace_agent_key_bindings
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_marketplace_agents_bound_model_name
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_agents DROP COLUMN IF EXISTS bound_model_name
    `);
  }
}

