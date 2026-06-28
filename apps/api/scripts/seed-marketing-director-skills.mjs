/**
 * Seed platform-global Marketing Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm --filter @service/api run seed:marketing-director-skills
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
    name: 'marketing-campaign-planner',
    category: 'marketing',
    description: '营销活动全流程策划与 A/B 测试设计器',
    requiredPermissions: ['marketing:campaign', 'read:analytics', 'read:billing'],
    metadata: { author: 'Foundry Team', tags: ['marketing', 'campaign', 'ab-testing', 'growth'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['marketing'] },
    toolSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        campaignGoal: { type: 'string', minLength: 1, maxLength: 2000 },
        targetAudience: { type: 'string', minLength: 1, maxLength: 2000 },
        budget: { type: 'number', minimum: 0 },
        timeline: {
          type: 'object',
          additionalProperties: false,
          properties: {
            start: { type: 'string', format: 'date' },
            end: { type: 'string', format: 'date' },
          },
          required: ['start', 'end'],
        },
        channels: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      },
      required: ['campaignGoal', 'targetAudience', 'budget', 'timeline'],
    },
    promptTemplate: `---
name: marketing-campaign-planner
version: 1.0
description: 营销活动全流程策划与 A/B 测试设计器
author: Foundry Team
tags: [marketing, campaign, ab-testing, growth]
requiredPermissions: [marketing:campaign, read:analytics, read:billing]
costLevel: medium
---

**指令**：
作为 Marketing Director，你负责设计高质量、可执行的营销 Campaign。

**输入**：
- campaignGoal: string
- targetAudience: string
- budget: number
- timeline: { start: date, end: date }
- channels: string[] (可选)

**必须输出 JSON**：
{
  "campaignName": string,
  "objective": string,
  "targetKPIs": [{ metric: string, target: number }],
  "phases": [{
    "phaseName": string,
    "durationDays": number,
    "channels": string[],
    "keyContent": string,
    "abTestVariants": number
  }],
  "estimatedCost": number,
  "risks": string[]
}

执行前必须先调用 ceo-budget-guardian 检查预算。
完成后自动触发 growth-experiment-runner 进行效果追踪。`,
  },
  {
    name: 'content-strategy-generator',
    category: 'marketing',
    description: '内容策略制定 + SEO 优化 + 品牌声音一致性',
    requiredPermissions: ['marketing:content', 'read:memory'],
    metadata: { author: 'Foundry Team', tags: ['content', 'seo', 'strategy'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['marketing'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: content-strategy-generator
version: 1.0
description: 内容策略制定 + SEO 优化 + 品牌声音一致性
author: Foundry Team
tags: [content, seo, strategy]
requiredPermissions: [marketing:content, read:memory]
costLevel: medium
---

**指令**：
生成长期内容策略，确保所有内容与品牌声音一致，并最大化 SEO 价值。

**输出 JSON**：
{
  "strategyName": string,
  "contentPillars": string[],
  "monthlyCalendar": [{ week: number, topics: string[], channels: string[] }],
  "seoRecommendations": [{ keyword: string, difficulty: number, priority: string }],
  "brandVoiceCheck": { score: number, suggestions: string[] }
}

会自动将重要内容摘要写入公司记忆（marketing 标签）。`,
  },
  {
    name: 'social-media-publisher',
    category: 'marketing',
    description: '多平台社交媒体内容发布与最佳时机调度',
    requiredPermissions: ['marketing:social', 'collaboration:send'],
    metadata: { author: 'Foundry Team', tags: ['social', 'publishing', 'scheduling'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['marketing'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: social-media-publisher
version: 1.0
description: 多平台社交媒体内容发布与最佳时机调度
author: Foundry Team
tags: [social, publishing, scheduling]
requiredPermissions: [marketing:social, collaboration:send]
costLevel: low
---

**指令**：
负责社交媒体内容的定时发布与表现监控。

**输出 JSON**：
{
  "posts": [{
    "platform": "twitter|linkedin|instagram|... ",
    "content": string,
    "scheduledTime": isoDate,
    "hashtags": string[],
    "mediaRequired": boolean
  }],
  "postingStrategy": { frequency: string, bestTime: string }
}`,
  },
  {
    name: 'growth-experiment-runner',
    category: 'marketing',
    description: '增长实验设计、执行与统计显著性评估',
    requiredPermissions: ['marketing:experiment', 'read:analytics'],
    metadata: { author: 'Foundry Team', tags: ['growth', 'experiment', 'analytics'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['marketing'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: growth-experiment-runner
version: 1.0
description: 增长实验设计、执行与统计显著性评估
author: Foundry Team
tags: [growth, experiment, analytics]
requiredPermissions: [marketing:experiment, read:analytics]
costLevel: medium
---

**指令**：
设计并执行增长实验，输出可行动的洞察。

**输出 JSON**：
{
  "experimentName": string,
  "hypothesis": string,
  "variants": [{ name: string, description: string, trafficSplit: number }],
  "successMetrics": [{ metric: string, baseline: number, target: number }],
  "durationDays": number,
  "analysisPlan": string
}`,
  },
  {
    name: 'brand-voice-analyzer',
    category: 'marketing',
    description: '所有对外内容品牌声音一致性检查',
    requiredPermissions: ['marketing:content'],
    metadata: { author: 'Foundry Team', tags: ['brand', 'voice', 'quality'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['marketing'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: brand-voice-analyzer
version: 1.0
description: 所有对外内容品牌声音一致性检查
author: Foundry Team
tags: [brand, voice, quality]
requiredPermissions: [marketing:content]
costLevel: low
---

**指令**：
对任何营销内容进行品牌声音审核。

**输出 JSON**：
{
  "score": number (0-100),
  "strengths": string[],
  "violations": string[],
  "rewrittenSuggestions": string[],
  "overallAssessment": "excellent|good|needs_revision|poor"
}`,
  },
  {
    name: 'marketing-budget-optimizer',
    category: 'marketing',
    description: '营销预算分配优化与渠道 ROI 分析',
    requiredPermissions: ['read:billing', 'marketing:campaign'],
    metadata: { author: 'Foundry Team', tags: ['budget', 'roi', 'optimization'], costLevel: 'high', targetRole: ['director'], departmentRoles: ['marketing'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: marketing-budget-optimizer
version: 1.0
description: 营销预算分配优化与渠道 ROI 分析
author: Foundry Team
tags: [budget, roi, optimization]
requiredPermissions: [read:billing, marketing:campaign]
costLevel: high
---

**指令**：
基于历史 ROI 数据，给出最优预算再分配建议。

**输出 JSON**：
{
  "currentAllocation": { channel: number, ... },
  "recommendedAllocation": { channel: number, ... },
  "expectedROIImprovement": number,
  "reallocationSuggestions": string[]
}

必须与 ceo-budget-guardian 联动，高风险调整需发起 approval。`,
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

