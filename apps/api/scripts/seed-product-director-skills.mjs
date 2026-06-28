/**
 * Seed platform-global Product Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:product-director-skills
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
    name: 'product-roadmap-prioritizer',
    category: 'product',
    description: '产品路线图优先级排序与战略对齐工具',
    requiredPermissions: ['product:roadmap', 'read:goals', 'read:analytics'],
    metadata: { author: 'Foundry Team', tags: ['product', 'roadmap', 'prioritization'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['product'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: product-roadmap-prioritizer
version: 1.0
description: 产品路线图优先级排序与战略对齐工具
author: Foundry Team
tags: [product, roadmap, prioritization]
requiredPermissions: [product:roadmap, read:goals, read:analytics]
costLevel: medium
---

**指令**：
作为 Product Director，你负责将公司 OKR/战略转化为可执行的产品路线图，并持续优化优先级。

**输入**：当前 OKR、已有 backlog、资源约束（可选）

**必须输出 JSON**：
{
  "roadmapName": string,
  "timeHorizon": "nextQuarter" | "next6Months" | "next12Months",
  "prioritizedFeatures": [{
    "featureId": string,
    "title": string,
    "priorityScore": number,
    "value": number,
    "effort": number,
    "roi": number,
    "dependencies": string[],
    "assignedDepartment": string
  }],
  "tradeoffAnalysis": string,
  "recommendedNextSprint": string[]
}

优先使用 RICE / ICE / MoSCoW 方法，并确保与 CEO 战略对齐。`,
  },
  {
    name: 'user-story-breaker',
    category: 'product',
    description: '将大功能拆解为清晰、可验收的用户故事',
    requiredPermissions: ['product:backlog'],
    metadata: { author: 'Foundry Team', tags: ['product', 'user-story', 'refinement'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['product'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: user-story-breaker
version: 1.0
description: 将大功能拆解为清晰、可验收的用户故事
author: Foundry Team
tags: [product, user-story, refinement]
requiredPermissions: [product:backlog]
costLevel: low
---

**指令**：
把产品需求拆解成 INVEST 原则（Independent, Negotiable, Valuable, Estimable, Small, Testable）的用户故事。

**输出 JSON**：
{
  "epicTitle": string,
  "userStories": [{
    "storyId": string,
    "asA": string,
    "iWant": string,
    "soThat": string,
    "acceptanceCriteria": string[],
    "storyPoints": number,
    "priority": "must|should|could|wont"
  }],
  "estimatedTotalEffort": number,
  "risksAndDependencies": string[]
}`,
  },
  {
    name: 'mvp-validator',
    category: 'product',
    description: 'MVP 可行性快速验证与风险评估',
    requiredPermissions: ['product:mvp', 'read:user-research'],
    metadata: { author: 'Foundry Team', tags: ['product', 'mvp', 'validation'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['product'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: mvp-validator
version: 1.0
description: MVP 可行性快速验证与风险评估
author: Foundry Team
tags: [product, mvp, validation]
requiredPermissions: [product:mvp, read:user-research]
costLevel: medium
---

**指令**：
对任何新功能提案进行 MVP 验证设计，降低盲目开发风险。

**输出 JSON**：
{
  "mvpName": string,
  "coreHypothesis": string,
  "successMetrics": [{ metric: string, target: number }],
  "validationMethods": ["user-interview", "landing-page-test", "prototype-test", ...],
  "buildPlan": { scope: string, timelineDays: number, costEstimate: number },
  "riskAssessment": { level: "low|medium|high", risks: string[] },
  "goNoGoRecommendation": "build" | "pivot" | "kill"
}`,
  },
  {
    name: 'user-research-synthesizer',
    category: 'product',
    description: '用户反馈、访谈、数据等多源洞察的结构化合成',
    requiredPermissions: ['read:memory', 'read:analytics'],
    metadata: { author: 'Foundry Team', tags: ['product', 'research', 'synthesis'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['product'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: user-research-synthesizer
version: 1.0
description: 用户反馈、访谈、数据等多源洞察的结构化合成
author: Foundry Team
tags: [product, research, synthesis]
requiredPermissions: [read:memory, read:analytics]
costLevel: medium
---

**指令**：
整合用户访谈、支持票、分析数据、记忆库等，输出可行动的产品洞察。

**输出 JSON**：
{
  "researchSummary": string,
  "keyInsights": [{
    "insight": string,
    "evidence": string[],
    "confidence": number
  }],
  "personaUpdates": [{ persona: string, painPoints: string[], opportunities: string[] }],
  "recommendedActions": string[],
  "tagsForMemory": ["user-research", "q3-insights"]
}`,
  },
  {
    name: 'product-metrics-definer',
    category: 'product',
    description: '定义产品 North Star Metric 与健康度仪表盘',
    requiredPermissions: ['product:metrics', 'read:observability'],
    metadata: { author: 'Foundry Team', tags: ['product', 'metrics', 'northstar'], costLevel: 'high', targetRole: ['director'], departmentRoles: ['product'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: product-metrics-definer
version: 1.0
description: 定义产品 North Star Metric 与健康度仪表盘
author: Foundry Team
tags: [product, metrics, northstar]
requiredPermissions: [product:metrics, read:observability]
costLevel: high
---

**指令**：
为产品/功能定义核心指标体系，并设计监控仪表盘。

**输出 JSON**：
{
  "northStarMetric": { name: string, definition: string, target: number },
  "guardrailMetrics": [{ name: string, definition: string, threshold: string }],
  "leadingIndicators": [{ name: string, definition: string }],
  "dashboardLayout": [{ chartType: string, metric: string, department: string }],
  "reviewCadence": "weekly|biweekly|monthly"
}

指标定义后会自动同步到 ObservabilityModule 和 Finance 的报表系统。`,
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

