import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 商城 Agent 公司级 assignment：从「安装时独占一把 Key」演进为「引用商城 + 运行时按 bindings 解析」。
 * - 去掉 assigned_llm_key_id 全局唯一（多公司可共享池内同一 Key）
 * - assigned_llm_key_id 可空（遗留安装快照 / 兜底）
 * - preferred_llm_key_id：公司显式钉选（可选）
 */
export class MarketplaceAssignmentDynamicPool1774400000000 implements MigrationInterface {
  name = 'MarketplaceAssignmentDynamicPool1774400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      DROP CONSTRAINT IF EXISTS uq_company_marketplace_assigned_llm_key
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      ALTER COLUMN assigned_llm_key_id DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      ADD COLUMN IF NOT EXISTS preferred_llm_key_id UUID REFERENCES llm_keys(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      ADD COLUMN IF NOT EXISTS subscription_id UUID
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_mkt_assignment_preferred_llm_key
      ON company_marketplace_agent_key_assignments(preferred_llm_key_id)
      WHERE preferred_llm_key_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM company_marketplace_agent_key_assignments
      WHERE assigned_llm_key_id IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      DROP COLUMN IF EXISTS subscription_id
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_company_mkt_assignment_preferred_llm_key
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      DROP COLUMN IF EXISTS preferred_llm_key_id
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      ALTER COLUMN assigned_llm_key_id SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE company_marketplace_agent_key_assignments
      ADD CONSTRAINT uq_company_marketplace_assigned_llm_key UNIQUE (assigned_llm_key_id)
    `);
  }
}
