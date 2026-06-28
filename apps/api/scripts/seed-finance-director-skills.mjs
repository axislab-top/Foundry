/**
 * Seed platform-global Finance Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:finance-director-skills
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
    name: 'finance-budget-tracker',
    category: 'finance',
    description: '实时预算消耗监控、预警与剩余额度分析',
    requiredPermissions: ['read:billing', 'billing:check'],
    metadata: { author: 'Foundry Team', tags: ['finance', 'budget', 'guard'], costLevel: 'high', targetRole: ['director'], departmentRoles: ['finance'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: finance-budget-tracker
version: 1.0
description: 实时预算消耗监控、预警与剩余额度分析
author: Foundry Team
tags: [finance, budget, guard]
requiredPermissions: [read:billing, billing:check]
costLevel: high
---

**指令**：
作为 Finance Director，你负责公司预算的健康与预警。

**输入**：companyId（自动从上下文获取）

**必须输出 JSON**：
{
  "overallBudget": {
    "totalAllocated": number,
    "totalConsumed": number,
    "remaining": number,
    "burnRate": number,
    "daysLeft": number
  },
  "departmentBreakdown": [{ department: string, allocated: number, consumed: number, percentage: number }],
  "criticalAlerts": [{
    "level": "warning|critical",
    "department": string,
    "message": string,
    "suggestedAction": string
  }],
  "forecastedRunoutDate": isoDate
}

任何剩余预算 < 30% 或单日 burn rate 异常时，必须自动触发 ceo-approval-initiator。`,
  },
  {
    name: 'finance-expense-analyzer',
    category: 'finance',
    description: '每笔 LLM/工具/Agent 消耗的精细归因分析',
    requiredPermissions: ['read:billing', 'read:observability'],
    metadata: { author: 'Foundry Team', tags: ['finance', 'cost', 'attribution'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['finance'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: finance-expense-analyzer
version: 1.0
description: 每笔 LLM/工具/Agent 消耗的精细归因分析
author: Foundry Team
tags: [finance, cost, attribution]
requiredPermissions: [read:billing, read:observability]
costLevel: medium
---

**指令**：
对最近消耗进行归因分析，帮助 CEO 和部门主管理解钱花在了哪里。

**输出 JSON**：
{
  "period": { from: isoDate, to: isoDate },
  "totalSpent": number,
  "topCostDrivers": [{
    "category": "llm|tool|agent|campaign",
    "amount": number,
    "percentage": number,
    "agentOrDepartment": string
  }],
  "roiInsights": [{ activity: string, estimatedReturn: number, roi: number }],
  "optimizationRecommendations": string[]
}`,
  },
  {
    name: 'finance-report-generator',
    category: 'finance',
    description: '自动生成周/月/季度财务与预算执行报告',
    requiredPermissions: ['read:billing', 'read:dashboard'],
    metadata: { author: 'Foundry Team', tags: ['finance', 'reporting'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['finance'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: finance-report-generator
version: 1.0
description: 自动生成周/月/季度财务与预算执行报告
author: Foundry Team
tags: [finance, reporting]
requiredPermissions: [read:billing, read:dashboard]
costLevel: medium
---

**指令**：
生成专业、可直接发给董事会/CEO 的财务报告。

**输出 JSON**：
{
  "reportType": "weekly|monthly|quarterly",
  "summary": { totalRevenue: number, totalCost: number, net: number },
  "keyCharts": [{ type: "burnRate"|"departmentSpending", description: string }],
  "highlights": string[],
  "risksAndRecommendations": string[]
}

报告会自动写入公司记忆（finance 标签），并在协作群中 @ CEO。`,
  },
  {
    name: 'finance-roi-calculator',
    category: 'finance',
    description: '项目/Campaign/Activity 的投资回报预测与事后评估',
    requiredPermissions: ['read:billing', 'marketing:campaign', 'sales:deal'],
    metadata: { author: 'Foundry Team', tags: ['finance', 'roi', 'analysis'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['finance'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: finance-roi-calculator
version: 1.0
description: 项目/Campaign/Activity 的投资回报预测与事后评估
author: Foundry Team
tags: [finance, roi, analysis]
requiredPermissions: [read:billing, marketing:campaign, sales:deal]
costLevel: medium
---

**指令**：
计算任何提案的预期 ROI，并与历史数据对比。

**输入**：proposal（包含预计成本、预期收益）

**输出 JSON**：
{
  "proposalName": string,
  "estimatedCost": number,
  "projectedReturn": number,
  "expectedROI": number,
  "breakEvenDays": number,
  "confidence": number,
  "comparisonWithHistorical": string,
  "recommendation": "approve|reject|modify"
}`,
  },
  {
    name: 'finance-approval-guard',
    category: 'finance',
    description: '高额或异常支出自动生成审批上下文',
    requiredPermissions: ['approval:create'],
    metadata: { author: 'Foundry Team', tags: ['finance', 'approval', 'guard'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['finance'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: finance-approval-guard
version: 1.0
description: 高额或异常支出自动生成审批上下文
author: Foundry Team
tags: [finance, approval, guard]
requiredPermissions: [approval:create]
costLevel: low
---

**指令**：
任何单笔超过阈值或异常模式的支出，必须先走审批。

**输出 JSON**：
{
  "approvalRequest": {
    "title": "高额预算申请：XXX",
    "amount": number,
    "reason": string,
    "impact": string,
    "alternatives": string[],
    "recommendedApprovers": ["ceo", "board"]
  }
}

只有获得 approvalToken 后才能继续执行该笔支出。`,
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

