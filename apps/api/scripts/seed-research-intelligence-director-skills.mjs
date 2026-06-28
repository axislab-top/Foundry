/**
 * Seed platform-global Research & Intelligence Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:research-intelligence-director-skills
 *   pnpm -C apps/api run seed:research-intelligence-director-skill-bindings
 */
import pg from 'pg';
import { loadEnvFromFile, resolveDatabaseUrl, toCategoryJson } from './lib/seed-helpers.mjs';

loadEnvFromFile();

const SKILLS = [
  {
    name: 'research-market-intelligence-synthesizer',
    category: 'research',
    description: '多源市场情报采集、去噪与结构化 synthesis，输出可下游消费的研究摘要',
    requiredPermissions: ['research:intelligence', 'read:market-data'],
    metadata: {
      author: 'Foundry Team',
      tags: ['research', 'intelligence', 'market'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['research-intelligence', 'research_intelligence'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: research-market-intelligence-synthesizer
version: 1.0
description: 多源市场情报 synthesis
---

**指令**：作为研究情报总监，整合多源市场信息并输出结构化情报摘要。

**输出 JSON**：
{
  "briefId": "string",
  "coverageWindow": "string",
  "keyThemes": ["string"],
  "actionableSignals": [{ "signal": "string", "confidence": "high|medium|low", "sources": ["string"] }],
  "dataGaps": ["string"],
  "downstreamHandoff": ["quant", "risk", "portfolio"]
}`,
  },
  {
    name: 'research-fundamental-analyst',
    category: 'research',
    description: '个股/板块基本面分析：财务质量、估值框架、催化剂与风险',
    requiredPermissions: ['research:fundamental', 'read:financials'],
    metadata: {
      author: 'Foundry Team',
      tags: ['research', 'fundamental', 'equity'],
      costLevel: 'high',
      targetRole: ['director'],
      departmentRoles: ['research-intelligence'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: research-fundamental-analyst
version: 1.0
description: 基本面分析
---

**输出 JSON**：
{
  "tickerOrUniverse": "string",
  "investmentThesis": "string",
  "valuationView": "undervalued|fair|overvalued|insufficient_data",
  "qualityScore": 0,
  "catalysts": ["string"],
  "keyRisks": ["string"],
  "recommendedHorizon": "short|medium|long"
}`,
  },
  {
    name: 'research-macro-policy-monitor',
    category: 'research',
    description: '宏观、政策与系统性事件监控，评估对股票组合的影响路径',
    requiredPermissions: ['research:macro', 'read:news'],
    metadata: {
      author: 'Foundry Team',
      tags: ['research', 'macro', 'policy'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['research-intelligence'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: research-macro-policy-monitor
version: 1.0
description: 宏观政策监控
---

**输出 JSON**：
{
  "monitoringPeriod": "string",
  "macroEvents": [{ "event": "string", "impactChannel": "string", "severity": "high|medium|low" }],
  "policyShifts": ["string"],
  "portfolioImplications": ["string"],
  "watchlist": ["string"]
}`,
  },
  {
    name: 'research-company-deep-dive',
    category: 'research',
    description: '个股深度研究包：商业模式、竞争格局、财务拆解与关键假设',
    requiredPermissions: ['research:deep-dive', 'read:financials'],
    metadata: {
      author: 'Foundry Team',
      tags: ['research', 'deep-dive', 'equity'],
      costLevel: 'high',
      targetRole: ['director'],
      departmentRoles: ['research-intelligence'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: research-company-deep-dive
version: 1.0
description: 个股深度研究
---

**输出 JSON**：
{
  "company": "string",
  "businessModelSummary": "string",
  "competitivePosition": "string",
  "financialHighlights": ["string"],
  "keyAssumptions": ["string"],
  "openQuestions": ["string"],
  "researchConfidence": "high|medium|low"
}`,
  },
  {
    name: 'research-investment-memo-writer',
    category: 'research',
    description: '撰写可交付的投资研究备忘录，供组合与风控决策引用',
    requiredPermissions: ['research:memo', 'write:research'],
    metadata: {
      author: 'Foundry Team',
      tags: ['research', 'memo', 'investment'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['research-intelligence'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: research-investment-memo-writer
version: 1.0
description: 投资研究备忘录
---

**输出 JSON**：
{
  "memoTitle": "string",
  "recommendation": "buy|hold|sell|watch",
  "executiveSummary": "string",
  "thesisBullets": ["string"],
  "riskFactors": ["string"],
  "catalystTimeline": [{ "date": "string", "event": "string" }],
  "approvalReady": false
}`,
  },
  {
    name: 'research-thesis-red-team',
    category: 'research',
    description: '对投资论点做 red-team 挑战，识别逻辑漏洞与反证',
    requiredPermissions: ['research:red-team'],
    metadata: {
      author: 'Foundry Team',
      tags: ['research', 'red-team', 'quality'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['research-intelligence'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: research-thesis-red-team
version: 1.0
description: 投资论点 red-team
---

**输出 JSON**：
{
  "thesisUnderReview": "string",
  "challengePoints": [{ "claim": "string", "counterEvidence": "string", "severity": "fatal|material|minor" }],
  "survivabilityScore": 0,
  "requiredRevisions": ["string"],
  "proceedToPortfolio": false
}`,
  },
];

async function main() {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  let inserted = 0;
  let updated = 0;
  try {
    for (const s of SKILLS) {
      const existing = await client.query(
        `select id from skills where company_id is null and name = $1 limit 1`,
        [s.name],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `
          insert into skills (
            id, company_id, name, category, description, tool_schema, prompt_template,
            implementation_type, handler_config, required_permissions, version, is_public, is_system, is_enabled, metadata
          ) values (
            gen_random_uuid(), null, $1, $2::jsonb, $3, $4::jsonb, $5,
            'builtin', null, $6::jsonb, 1, true, true, true, $7::jsonb
          )
        `,
          [
            s.name,
            toCategoryJson(s.category),
            s.description,
            JSON.stringify(s.toolSchema ?? null),
            s.promptTemplate,
            JSON.stringify(s.requiredPermissions ?? []),
            JSON.stringify(s.metadata ?? null),
          ],
        );
        inserted += 1;
      } else {
        await client.query(
          `
          update skills
          set
            category = $2::jsonb,
            description = $3,
            tool_schema = $4::jsonb,
            prompt_template = $5,
            required_permissions = $6::jsonb,
            metadata = coalesce(metadata, '{}'::jsonb) || $7::jsonb,
            is_system = true,
            is_public = true,
            is_enabled = true,
            updated_at = current_timestamp
          where company_id is null and name = $1
        `,
          [
            s.name,
            toCategoryJson(s.category),
            s.description,
            JSON.stringify(s.toolSchema ?? null),
            s.promptTemplate,
            JSON.stringify(s.requiredPermissions ?? []),
            JSON.stringify(s.metadata ?? null),
          ],
        );
        updated += 1;
      }
    }
    console.log(
      JSON.stringify({ ok: true, total: SKILLS.length, inserted, updated, names: SKILLS.map((x) => x.name) }, null, 2),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
