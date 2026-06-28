/**
 * Seed platform-global Growth Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:growth-director-skills
 *
 * Env:
 *   DATABASE_URL (preferred) or POSTGRES/DB env fallback
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { toCategoryJson } from './lib/seed-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  const tryPaths = [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
    join(__dirname, '../../.env'),
  ];
  for (const p of tryPaths) {
    try {
      const raw = readFileSync(p, 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].replace(/\r$/, '');
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) process.env[k] = v;
      }
      break;
    } catch {
      // ignore
    }
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
  const user = process.env.POSTGRES_USER || process.env.DB_USERNAME || 'postgres';
  const pass = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || 'postgres';
  const db = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

const SKILLS = [
  {
    name: 'growth-experiment-designer',
    category: 'growth',
    description: '科学设计 A/B 测试与增长实验',
    requiredPermissions: ['growth:experiment', 'read:analytics', 'read:marketing'],
    metadata: { author: 'Foundry Team', tags: ['growth', 'experiment', 'ab-testing'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['growth'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: growth-experiment-designer
version: 1.0
description: 科学设计 A/B 测试与增长实验
author: Foundry Team
tags: [growth, experiment, ab-testing]
requiredPermissions: [growth:experiment, read:analytics, read:marketing]
costLevel: medium
---

**指令**：
作为 Growth Director，你负责设计严谨、可度量的增长实验。

**输出 JSON**：
{
  "experimentName": string,
  "hypothesis": string,
  "variants": [{
    "name": string,
    "description": string,
    "trafficSplit": number
  }],
  "successMetrics": [{
    "metric": string,
    "baseline": number,
    "targetLift": number,
    "statisticalPower": number
  }],
  "durationDays": number,
  "riskLevel": "low|medium|high",
  "implementationSteps": string[]
}`,
  },
  {
    name: 'growth-virality-coefficient-calculator',
    category: 'growth',
    description: '病毒传播系数（k-factor）分析与优化',
    requiredPermissions: ['growth:virality', 'read:analytics'],
    metadata: { author: 'Foundry Team', tags: ['growth', 'virality', 'referral'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['growth'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: growth-virality-coefficient-calculator
version: 1.0
description: 病毒传播系数（k-factor）分析与优化
author: Foundry Team
tags: [growth, virality, referral]
requiredPermissions: [growth:virality, read:analytics]
costLevel: medium
---

**指令**：
计算并优化产品/功能的病毒传播能力。

**输出 JSON**：
{
  "currentKFactor": number,
  "breakdown": {
    "invitationRate": number,
    "conversionRate": number,
    "cycles": number
  },
  "leveragePoints": [{
    "area": string,
    "potentialLift": number,
    "estimatedEffort": string
  }],
  "optimizationRecommendations": string[]
}`,
  },
  {
    name: 'growth-acquisition-channel-optimizer',
    category: 'growth',
    description: '多渠道获客 ROI 分析与智能预算再分配',
    requiredPermissions: ['growth:acquisition', 'read:billing', 'read:marketing'],
    metadata: { author: 'Foundry Team', tags: ['growth', 'acquisition', 'roi'], costLevel: 'high', targetRole: ['director'], departmentRoles: ['growth'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: growth-acquisition-channel-optimizer
version: 1.0
description: 多渠道获客 ROI 分析与智能预算再分配
author: Foundry Team
tags: [growth, acquisition, roi]
requiredPermissions: [growth:acquisition, read:billing, read:marketing]
costLevel: high
---

**指令**：
持续优化获客渠道效率，最大化 ROI。

**输出 JSON**：
{
  "channelPerformance": [{
    "channel": string,
    "cac": number,
    "ltv": number,
    "roi": number,
    "volume": number
  }],
  "recommendedBudgetReallocation": [{
    "channel": string,
    "currentPercentage": number,
    "suggestedPercentage": number,
    "expectedGain": number
  }],
  "newChannelSuggestions": string[]
}`,
  },
  {
    name: 'growth-cohort-analysis-tool',
    category: 'growth',
    description: '用户群组行为分析与留存提升诊断',
    requiredPermissions: ['growth:cohort', 'read:analytics'],
    metadata: { author: 'Foundry Team', tags: ['growth', 'cohort', 'retention'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['growth'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: growth-cohort-analysis-tool
version: 1.0
description: 用户群组行为分析与留存提升诊断
author: Foundry Team
tags: [growth, cohort, retention]
requiredPermissions: [growth:cohort, read:analytics]
costLevel: medium
---

**指令**：
通过 Cohort 分析发现留存问题并提出改进方案。

**输出 JSON**：
{
  "cohortSummary": [{
    "cohort": string,
    "size": number,
    "day7Retention": number,
    "day30Retention": number
  }],
  "keyInsights": string[],
  "retentionImprovementOpportunities": [{
    "stage": string,
    "problem": string,
    "suggestedAction": string,
    "projectedLift": number
  }]
}`,
  },
  {
    name: 'growth-metric-northstar-definer',
    category: 'growth',
    description: '定义并监控增长核心 North Star Metric',
    requiredPermissions: ['growth:metrics', 'read:observability'],
    metadata: { author: 'Foundry Team', tags: ['growth', 'northstar', 'metrics'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['growth'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: growth-metric-northstar-definer
version: 1.0
description: 定义并监控增长核心 North Star Metric
author: Foundry Team
tags: [growth, northstar, metrics]
requiredPermissions: [growth:metrics, read:observability]
costLevel: medium
---

**指令**：
为公司/产品定义最核心的增长指标体系。

**输出 JSON**：
{
  "northStarMetric": {
    "name": string,
    "definition": string,
    "currentValue": number,
    "target": number,
    "trend": "up|down|stable"
  },
  "guardrailMetrics": [{ name: string, current: number, threshold: number }],
  "leadingIndicators": string[],
  "dashboardRecommendations": string[]
}`,
  },
  {
    name: 'growth-hack-idea-generator',
    category: 'growth',
    description: '低成本高杠杆增长黑客创意生成',
    requiredPermissions: ['growth:hack', 'collaboration:room'],
    metadata: { author: 'Foundry Team', tags: ['growth', 'hack', 'ideation'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['growth'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: growth-hack-idea-generator
version: 1.0
description: 低成本高杠杆增长黑客创意生成
author: Foundry Team
tags: [growth, hack, ideation]
requiredPermissions: [growth:hack, collaboration:room]
costLevel: low
---

**指令**：
快速生成创意增长点，优先低成本、高杠杆方案。

**输出 JSON**：
{
  "growthHacks": [{
    "title": string,
    "description": string,
    "estimatedCost": number,
    "expectedImpact": string,
    "timeToTest": string,
    "riskLevel": "low|medium|high"
  }],
  "prioritizedTop3": string[],
  "validationPlan": string
}`,
  },
];

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    let inserted = 0;
    let updated = 0;
    for (const s of SKILLS) {
      const exists = await client.query(
        `select id from skills where company_id is null and name = $1 limit 1`,
        [s.name],
      );
      if (exists.rowCount === 0) {
        await client.query(
          `
          insert into skills (
            id, company_id, name, category, description, tool_schema, prompt_template,
            implementation_type, handler_config, required_permissions, version, is_public, is_system, metadata
          ) values (
            gen_random_uuid(), null, $1, $2::jsonb, $3, $4::jsonb, $5,
            'builtin', null, $6::jsonb, 1, true, true, $7::jsonb
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
      JSON.stringify(
        {
          ok: true,
          total: SKILLS.length,
          inserted,
          updated,
          names: SKILLS.map((x) => x.name),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

