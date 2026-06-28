/**
 * Seed platform-global Sales Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:sales-director-skills
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
    name: 'sales-pipeline-manager',
    category: 'sales',
    description: '销售管道全流程可视化管理与堵点诊断',
    requiredPermissions: ['sales:pipeline', 'read:crm', 'read:billing'],
    metadata: { author: 'Foundry Team', tags: ['sales', 'pipeline', 'forecasting'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['sales'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: sales-pipeline-manager
version: 1.0
description: 销售管道全流程可视化管理与堵点诊断
author: Foundry Team
tags: [sales, pipeline, forecasting]
requiredPermissions: [sales:pipeline, read:crm, read:billing]
costLevel: medium
---

**指令**：
作为 Sales Director，你负责维护健康、可预测的销售管道。

**输入**：当前管道数据（或空则自动拉取最新）

**必须输出 JSON**：
{
  "pipelineHealth": {
    "totalDeals": number,
    "totalValue": number,
    "conversionRate": number,
    "avgCycleDays": number
  },
  "stageBreakdown": [{ stage: string, count: number, value: number, bottleneckScore: number }],
  "topBlockers": string[],
  "recommendedActions": [{
    "action": string,
    "priority": "high|medium|low",
    "expectedImpact": string
  }]
}

执行后自动同步到 CRM 并触发 revenue-forecast-tool 更新预测。`,
  },
  {
    name: 'negotiation-script-generator',
    category: 'sales',
    description: '个性化谈判话术与异议处理策略生成器',
    requiredPermissions: ['sales:negotiation'],
    metadata: { author: 'Foundry Team', tags: ['sales', 'negotiation'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['sales'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: negotiation-script-generator
version: 1.0
description: 个性化谈判话术与异议处理策略生成器
author: Foundry Team
tags: [sales, negotiation]
requiredPermissions: [sales:negotiation]
costLevel: low
---

**指令**：
根据客户类型、当前阶段、历史互动生成高转化谈判脚本。

**输入**：
- dealId 或 clientProfile
- currentObjection: string (可选)

**输出 JSON**：
{
  "script": [{
    "phase": "opening|discovery|objection|closing",
    "lines": string[],
    "tone": "collaborative|assertive|consultative"
  }],
  "keyObjectionHandlers": [{ objection: string, response: string, successRate: number }],
  "closingTechniques": string[]
}`,
  },
  {
    name: 'lead-scoring-engine',
    category: 'sales',
    description: '多维度潜在客户智能打分与优先级排序',
    requiredPermissions: ['sales:lead', 'read:analytics'],
    metadata: { author: 'Foundry Team', tags: ['sales', 'lead', 'scoring'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['sales'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: lead-scoring-engine
version: 1.0
description: 多维度潜在客户智能打分与优先级排序
author: Foundry Team
tags: [sales, lead, scoring]
requiredPermissions: [sales:lead, read:analytics]
costLevel: medium
---

**指令**：
对所有 Leads 进行智能打分，输出优先跟进列表。

**输出 JSON**：
{
  "scoredLeads": [{
    "leadId": string,
    "score": number (0-100),
    "tier": "hot|warm|cold",
    "keyFactors": string[],
    "recommendedNextAction": string
  }],
  "summary": {
    "hotLeadsCount": number,
    "expectedConversion": number
  }
}`,
  },
  {
    name: 'revenue-forecast-tool',
    category: 'sales',
    description: '营收预测、偏差分析与预警',
    requiredPermissions: ['sales:forecast', 'read:billing'],
    metadata: { author: 'Foundry Team', tags: ['sales', 'forecasting', 'finance'], costLevel: 'high', targetRole: ['director'], departmentRoles: ['sales'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: revenue-forecast-tool
version: 1.0
description: 营收预测、偏差分析与预警
author: Foundry Team
tags: [sales, forecasting, finance]
requiredPermissions: [sales:forecast, read:billing]
costLevel: high
---

**指令**：
生成可靠的短期（30天）和中期（90天）营收预测。

**输出 JSON**：
{
  "forecast": {
    "next30Days": number,
    "next90Days": number,
    "confidence": number (0-100)
  },
  "varianceAnalysis": { actualVsForecast: number, reasons: string[] },
  "risks": string[],
  "adjustmentRecommendations": string[]
}

必须与 Finance Director 的预算工具联动，高偏差时自动触发 approval。`,
  },
  {
    name: 'sales-team-performance-coach',
    category: 'sales',
    description: '销售团队个体绩效诊断与针对性教练方案',
    requiredPermissions: ['sales:team', 'collaboration:send'],
    metadata: { author: 'Foundry Team', tags: ['sales', 'coaching', 'performance'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['sales'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: sales-team-performance-coach
version: 1.0
description: 销售团队个体绩效诊断与针对性教练方案
author: Foundry Team
tags: [sales, coaching, performance]
requiredPermissions: [sales:team, collaboration:send]
costLevel: medium
---

**指令**：
分析销售团队/个体表现，输出个性化提升方案。

**输出 JSON**：
{
  "teamOverview": { winRate: number, avgDealSize: number, ... },
  "individualInsights": [{
    "agentId": string,
    "strengths": string[],
    "improvementAreas": string[],
    "coachingPlan": string[]
  }],
  "teamTrainingTopics": string[]
}`,
  },
  {
    name: 'deal-closing-accelerator',
    category: 'sales',
    description: '高价值交易诊断与成交加速策略',
    requiredPermissions: ['sales:deal'],
    metadata: { author: 'Foundry Team', tags: ['sales', 'closing', 'high-value'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['sales'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: deal-closing-accelerator
version: 1.0
description: 高价值交易诊断与成交加速策略
author: Foundry Team
tags: [sales, closing, high-value]
requiredPermissions: [sales:deal]
costLevel: medium
---

**指令**：
针对金额大、周期长的关键交易，提供加速关闭方案。

**输出 JSON**：
{
  "dealDiagnosis": { stage: string, riskLevel: string, blockers: string[] },
  "accelerationStrategies": [{
    "strategy": string,
    "expectedImpact": string,
    "requiredResources": string[]
  }],
  "decisionMakerMap": [{ person: string, influence: number, nextTouchPoint: string }]
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

