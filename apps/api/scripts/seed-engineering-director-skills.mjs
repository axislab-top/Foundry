/**
 * Seed platform-global Engineering Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:engineering-director-skills
 *   pnpm -C apps/api run seed:engineering-director-skill-bindings   # tool bindings + v2 prompts
 *   pnpm -C apps/api run audit:engineering-director-skills          # verify
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
    name: 'engineering-code-review-orchestrator',
    category: 'engineering',
    description: '自动化代码审查流程协调与质量门控',
    requiredPermissions: ['engineering:code-review', 'read:git'],
    metadata: { author: 'Foundry Team', tags: ['engineering', 'code-review', 'quality'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['engineering', 'tech'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: engineering-code-review-orchestrator
version: 1.0
description: 自动化代码审查流程协调与质量门控
author: Foundry Team
tags: [engineering, code-review, quality]
requiredPermissions: [engineering:code-review, read:git]
costLevel: medium
---

**指令**：
作为 Engineering Director，你负责确保所有代码变更达到高质量标准。

**输出 JSON**：
{
  "reviewSessionId": string,
  "prOrBranch": string,
  "reviewersAssigned": string[],
  "checklistResults": [{ item: string, status: "pass|fail|warning", comment: string }],
  "overallQualityScore": number (0-100),
  "blockingIssues": string[],
  "approved": boolean,
  "suggestedImprovements": string[]
}

审查通过后自动触发 CI/CD 流水线，失败则通知对应开发者。`,
  },
  {
    name: 'engineering-tech-debt-assessor',
    category: 'engineering',
    description: '技术债务扫描、量化与优先级排序',
    requiredPermissions: ['engineering:tech-debt', 'read:codebase'],
    metadata: { author: 'Foundry Team', tags: ['engineering', 'tech-debt', 'refactoring'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['engineering', 'tech'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: engineering-tech-debt-assessor
version: 1.0
description: 技术债务扫描、量化与优先级排序
author: Foundry Team
tags: [engineering, tech-debt, refactoring]
requiredPermissions: [engineering:tech-debt, read:codebase]
costLevel: medium
---

**指令**：
定期扫描代码库，量化技术债务并给出修复优先级。

**输出 JSON**：
{
  "debtScore": number (0-100),
  "topDebtItems": [{
    "type": "code-smell|outdated-dependency|architecture-issue",
    "location": string,
    "severity": "high|medium|low",
    "estimatedEffortDays": number,
    "businessImpact": string
  }],
  "refactoringRoadmap": [{ quarter: string, items: string[], expectedVelocityGain: number }],
  "recommendation": "address-now|monitor|accept-debt"
}`,
  },
  {
    name: 'engineering-architecture-decision-recorder',
    category: 'engineering',
    description: '架构决策记录（ADR）生成与知识库维护',
    requiredPermissions: ['engineering:architecture', 'write:memory'],
    metadata: { author: 'Foundry Team', tags: ['engineering', 'adr', 'architecture'], costLevel: 'low', targetRole: ['director'], departmentRoles: ['engineering', 'tech'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: engineering-architecture-decision-recorder
version: 1.0
description: 架构决策记录（ADR）生成与知识库维护
author: Foundry Team
tags: [engineering, adr, architecture]
requiredPermissions: [engineering:architecture, write:memory]
costLevel: low
---

**指令**：
为重大架构决策创建标准化 ADR 并写入公司记忆。

**输出 JSON**：
{
  "adrId": string,
  "title": string,
  "status": "proposed|accepted|deprecated",
  "context": string,
  "decision": string,
  "consequences": string[],
  "alternativesConsidered": string[]
}

自动打上 \`architecture\` 标签并通知 Product Director。`,
  },
  {
    name: 'engineering-ci-cd-pipeline-manager',
    category: 'engineering',
    description: 'CI/CD 流水线优化、故障诊断与部署管理',
    requiredPermissions: ['engineering:ci-cd', 'read:deployment'],
    metadata: { author: 'Foundry Team', tags: ['engineering', 'ci-cd', 'devops'], costLevel: 'high', targetRole: ['director'], departmentRoles: ['engineering', 'tech'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: engineering-ci-cd-pipeline-manager
version: 1.0
description: CI/CD 流水线优化、故障诊断与部署管理
author: Foundry Team
tags: [engineering, ci-cd, devops]
requiredPermissions: [engineering:ci-cd, read:deployment]
costLevel: high
---

**指令**：
监控并优化所有 CI/CD 流水线，确保部署可靠高效。

**输出 JSON**：
{
  "pipelineHealth": { successRate: number, avgDuration: number, failureRate: number },
  "recentFailures": [{ pipeline: string, error: string, frequency: number }],
  "optimizationSuggestions": string[],
  "deploymentRecommendations": [{ environment: string, action: string }]
}`,
  },
  {
    name: 'engineering-security-scanner',
    category: 'engineering',
    description: '代码、依赖、配置安全扫描与合规检查',
    requiredPermissions: ['engineering:security'],
    metadata: { author: 'Foundry Team', tags: ['engineering', 'security', 'compliance'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['engineering', 'tech'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: engineering-security-scanner
version: 1.0
description: 代码、依赖、配置安全扫描与合规检查
author: Foundry Team
tags: [engineering, security, compliance]
requiredPermissions: [engineering:security]
costLevel: medium
---

**指令**：
执行安全扫描并生成修复建议。

**输出 JSON**：
{
  "scanSummary": { critical: number, high: number, medium: number, low: number },
  "topVulnerabilities": [{ cve: string, severity: string, location: string, fix: string }],
  "complianceStatus": "compliant|partial|non-compliant",
  "immediateActions": string[]
}`,
  },
  {
    name: 'engineering-ai-tool-integrator',
    category: 'engineering',
    description: '为工程团队引入并优化 AI 开发工具',
    requiredPermissions: ['engineering:tools'],
    metadata: { author: 'Foundry Team', tags: ['engineering', 'ai-tools', 'productivity'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['engineering', 'tech'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: engineering-ai-tool-integrator
version: 1.0
description: 为工程团队引入并优化 AI 开发工具
author: Foundry Team
tags: [engineering, ai-tools, productivity]
requiredPermissions: [engineering:tools]
costLevel: medium
---

**指令**：
评估并集成新的 AI 开发工具，提升团队效率。

**输出 JSON**：
{
  "toolName": string,
  "integrationPlan": { steps: string[], estimatedTimeDays: number },
  "expectedProductivityGain": number,
  "risks": string[],
  "trainingPlanForTeam": string[]
}`,
  },
  {
    name: 'engineering-team-velocity-coach',
    category: 'engineering',
    description: '工程团队速度诊断、瓶颈消除与过程改进',
    requiredPermissions: ['engineering:team', 'read:observability'],
    metadata: { author: 'Foundry Team', tags: ['engineering', 'velocity', 'coaching'], costLevel: 'medium', targetRole: ['director'], departmentRoles: ['engineering', 'tech'] },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: engineering-team-velocity-coach
version: 1.0
description: 工程团队速度诊断、瓶颈消除与过程改进
author: Foundry Team
tags: [engineering, velocity, coaching]
requiredPermissions: [engineering:team, read:observability]
costLevel: medium
---

**指令**：
分析团队产能，消除瓶颈，提升交付速度。

**输出 JSON**：
{
  "currentVelocity": number,
  "historicalTrend": string,
  "topBottlenecks": [{ area: string, impact: number, rootCause: string }],
  "improvementActions": [{
    "action": string,
    "expectedVelocityGain": number,
    "effort": "small|medium|large"
  }],
  "processRecommendations": string[]
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

