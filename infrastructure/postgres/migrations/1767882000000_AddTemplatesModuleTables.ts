import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TemplatesModule：公司模板市场、模板内容快照、Agent 商城商品、模板-Agent 关联。
 * 平台级目录表，不启用 RLS（与 company_id 租户数据隔离）。
 */
export class AddTemplatesModuleTables1767882000000 implements MigrationInterface {
  name = 'AddTemplatesModuleTables1767882000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS company_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(120) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        industry VARCHAR(120),
        scale VARCHAR(64),
        template_type VARCHAR(64) NOT NULL DEFAULT 'company',
        preview_image_url VARCHAR(500),
        price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        is_published BOOLEAN NOT NULL DEFAULT false,
        version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
        usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
        rating_avg NUMERIC(4, 2),
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_company_templates_slug UNIQUE (slug),
        CONSTRAINT chk_company_templates_type CHECK (
          template_type IN ('company', 'industry_pack', 'scale_pack')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_company_templates_industry
      ON company_templates(industry)
      WHERE is_published = true
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS template_contents (
        template_id UUID PRIMARY KEY REFERENCES company_templates(id) ON DELETE CASCADE,
        content JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS marketplace_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(120) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        expertise TEXT,
        system_prompt TEXT,
        recommended_skills JSONB,
        pricing_model VARCHAR(32) NOT NULL DEFAULT 'free',
        price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
        subscription_interval VARCHAR(32),
        is_published BOOLEAN NOT NULL DEFAULT false,
        usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
        rating_avg NUMERIC(4, 2),
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_marketplace_agents_slug UNIQUE (slug),
        CONSTRAINT chk_marketplace_agents_pricing CHECK (
          pricing_model IN ('free', 'one_time', 'subscription')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_published
      ON marketplace_agents(is_published)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS template_agent_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID NOT NULL REFERENCES company_templates(id) ON DELETE CASCADE,
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        role_hint VARCHAR(64),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_template_agent UNIQUE (template_id, marketplace_agent_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_template_agent_mappings_template
      ON template_agent_mappings(template_id)
    `);

    const starterTech = `{
      "defaults": {
        "goal": "从模板快速启动一家技术型 AI 公司",
        "initialBudget": 1000
      },
      "organization": {
        "nodes": [
          { "title": "董事会", "kind": "board" },
          { "title": "CEO", "kind": "executive" },
          { "title": "研发部", "kind": "department" }
        ]
      },
      "agents": [
        {
          "name": "CEO",
          "role": "ceo",
          "expertise": "战略与执行",
          "systemPrompt": "你是科技公司的 CEO，负责战略与团队协调。"
        }
      ],
      "skills": [],
      "memorySeeds": [],
      "taskSeeds": []
    }`;

    const contentStudio = `{
      "defaults": {
        "goal": "内容创作与增长",
        "initialBudget": 500
      },
      "organization": {
        "nodes": [
          { "title": "创意总监", "kind": "executive" },
          { "title": "内容组", "kind": "department" }
        ]
      },
      "agents": [],
      "skills": [],
      "memorySeeds": [],
      "taskSeeds": []
    }`;

    await queryRunner.query(
      `
      INSERT INTO company_templates (id, slug, name, description, industry, scale, template_type, is_published, version, metadata)
      VALUES
        (
          'a0000001-0000-4000-8000-000000000001',
          'tech-starter',
          '初创科技公司',
          '含董事会、CEO、研发部门的起步结构，适合产品与技术团队。',
          'technology',
          'small',
          'company',
          true,
          '1.0.0',
          '{"tags":["saas","engineering"]}'::jsonb
        ),
        (
          'a0000002-0000-4000-8000-000000000002',
          'content-studio',
          '内容创作公司',
          '适合自媒体与营销团队的内容生产模板。',
          'marketing',
          'small',
          'company',
          true,
          '1.0.0',
          '{"tags":["content","creative"]}'::jsonb
        )
      ON CONFLICT (slug) DO NOTHING
    `,
    );

    await queryRunner.query(
      `
      INSERT INTO template_contents (template_id, content)
      VALUES
        ('a0000001-0000-4000-8000-000000000001', $1::jsonb),
        ('a0000002-0000-4000-8000-000000000002', $2::jsonb)
      ON CONFLICT (template_id) DO NOTHING
    `,
      [starterTech, contentStudio],
    );

    await queryRunner.query(`
      INSERT INTO marketplace_agents (id, slug, name, description, expertise, system_prompt, pricing_model, is_published, metadata)
      VALUES (
        'b0000001-0000-4000-8000-000000000001',
        'senior-fin-analyst',
        '资深财务分析师',
        '面向预算、预测与报表场景的财务 Agent。',
        '财务建模、预算分析',
        '你是资深财务分析师，输出严谨、可复核的数字与假设说明。',
        'free',
        true,
        '{"tags":["finance","analytics"]}'::jsonb
      )
      ON CONFLICT (slug) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO template_agent_mappings (template_id, marketplace_agent_id, sort_order, role_hint)
      VALUES (
        'a0000001-0000-4000-8000-000000000001',
        'b0000001-0000-4000-8000-000000000001',
        0,
        'advisor'
      )
      ON CONFLICT ON CONSTRAINT uq_template_agent DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS template_agent_mappings`);
    await queryRunner.query(`DROP TABLE IF EXISTS template_contents`);
    await queryRunner.query(`DROP TABLE IF EXISTS company_templates`);
    await queryRunner.query(`DROP TABLE IF EXISTS marketplace_agents`);
  }
}
