/**
 * Seed platform-global Operations Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:operations-director-skills
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
    name: 'operations-process-optimizer',
    category: 'operations',
    description: '跨部门流程诊断、优化与自动化方案设计',
    requiredPermissions: ['operations:process', 'read:observability', 'collaboration:room'],
    metadata: { author: 'Foundry Team', tags: ['operations', 'process', 'optimization'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['operations'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: operations-process-optimizer
version: 1.0
description: 跨部门流程诊断、优化与自动化方案设计
author: Foundry Team
tags: [operations, process, optimization]
requiredPermissions: [operations:process, read:observability, collaboration:room]
costLevel: medium
---

**指令**：
作为 Operations Director，你负责发现并消除公司内部低效流程。

**输出 JSON**：
{
  "processName": string,
  "currentBottlenecks": [{ step: string, delayDays: number, impact: string }],
  "proposedOptimizedFlow": [{ step: string, owner: string, automationLevel: "manual|semi|full" }],
  "estimatedEfficiencyGain": number,   // 百分比
  "implementationPlan": { timelineWeeks: number, requiredResources: string[] }
}

优化方案必须与 Engineering Director 的 CI/CD 和 Product Director 的 roadmap 对齐。`,
  },
  {
    name: 'operations-resource-scheduler',
    category: 'operations',
    description: '公司级资源（Agent、算力、预算、人力）智能调度',
    requiredPermissions: ['operations:resource', 'read:billing', 'read:agents'],
    metadata: { author: 'Foundry Team', tags: ['operations', 'scheduling', 'resource'], costLevel: 'high', targetRole: ['director'], departmentRoles: ['operations'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: operations-resource-scheduler
version: 1.0
description: 公司级资源（Agent、算力、预算、人力）智能调度
author: Foundry Team
tags: [operations, scheduling, resource]
requiredPermissions: [operations:resource, read:billing, read:agents]
costLevel: high
---

**指令**：
根据当前任务负载、预算、优先级智能分配资源。

**输出 JSON**：
{
  "allocationPlan": [{
    "resourceType": "agent|llm|budget|compute",
    "assignedTo": string,
    "amount": number,
    "duration": string,
    "reason": string
  }],
  "conflictResolution": string[],
  "utilizationForecast": { current: number, projected: number }
}

任何超过预算或高优先级资源分配必须先走 finance-approval-guard。`,
  },
  {
    name: 'operations-kpi-dashboard-builder',
    category: 'operations',
    description: '运营 KPI 体系定义、仪表盘构建与实时监控',
    requiredPermissions: ['operations:kpi', 'read:observability'],
    metadata: { author: 'Foundry Team', tags: ['operations', 'kpi', 'dashboard'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['operations'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: operations-kpi-dashboard-builder
version: 1.0
description: 运营 KPI 体系定义、仪表盘构建与实时监控
author: Foundry Team
tags: [operations, kpi, dashboard]
requiredPermissions: [operations:kpi, read:observability]
costLevel: medium
---

**指令**：
为公司/部门定义可量化的运营指标并设计监控仪表盘。

**输出 JSON**：
{
  "kpiFramework": [{
    "category": "efficiency|quality|cost|speed",
    "metric": string,
    "target": number,
    "current": number,
    "owner": string
  }],
  "dashboardConfig": [{ chartType: string, metric: string, refreshInterval: string }],
  "alertRules": [{ metric: string, threshold: number, action: string }]
}`,
  },
  {
    name: 'operations-risk-assessor',
    category: 'operations',
    description: '运营层面系统性风险识别与缓解方案',
    requiredPermissions: ['operations:risk', 'read:alerts'],
    metadata: { author: 'Foundry Team', tags: ['operations', 'risk', 'compliance'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['operations'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: operations-risk-assessor
version: 1.0
description: 运营层面系统性风险识别与缓解方案
author: Foundry Team
tags: [operations, risk, compliance]
requiredPermissions: [operations:risk, read:alerts]
costLevel: medium
---

**指令**：
扫描流程、资源、合规等方面的潜在风险。

**输出 JSON**：
{
  "risks": [{
    "category": "single-point-failure|capacity|compliance|cost-overrun",
    "severity": "critical|high|medium|low",
    "description": string,
    "probability": number,
    "mitigationPlan": string,
    "owner": string
  }],
  "overallRiskScore": number (0-100),
  "immediateActions": string[]
}`,
  },
  {
    name: 'operations-cross-team-coordinator',
    category: 'operations',
    description: '跨部门冲突解决与联合任务协调',
    requiredPermissions: ['collaboration:room', 'operations:coordination'],
    metadata: { author: 'Foundry Team', tags: ['operations', 'coordination', 'collaboration'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['operations'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: operations-cross-team-coordinator
version: 1.0
description: 跨部门冲突解决与联合任务协调
author: Foundry Team
tags: [operations, coordination, collaboration]
requiredPermissions: [collaboration:room, operations:coordination]
costLevel: low
---

**指令**：
当出现跨部门依赖或冲突时，主动发起协调。

**输出 JSON**：
{
  "coordinationSession": {
    "roomName": string,
    "invitedDirectors": string[],
    "agenda": string[],
    "deadline": isoDate
  },
  "proposedResolution": string,
  "escalationNeeded": boolean
}`,
  },
  {
    name: 'operations-efficiency-auditor',
    category: 'operations',
    description: '定期效率审计与成本节约机会诊断',
    requiredPermissions: ['operations:audit', 'read:billing'],
    metadata: { author: 'Foundry Team', tags: ['operations', 'audit', 'efficiency'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['operations'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: operations-efficiency-auditor
version: 1.0
description: 定期效率审计与成本节约机会诊断
author: Foundry Team
tags: [operations, audit, efficiency]
requiredPermissions: [operations:audit, read:billing]
costLevel: medium
---

**指令**：
定期审计公司运营效率，找出浪费点并提出节约方案。

**输出 JSON**：
{
  "auditPeriod": { from: isoDate, to: isoDate },
  "efficiencyScore": number,
  "topWasteAreas": [{ area: string, estimatedMonthlyCost: number, savingsPotential: number }],
  "quickWins": string[],
  "strategicImprovements": string[]
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

