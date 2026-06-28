/**
 * Seed platform-global Design Director core skills (idempotent by name, company_id IS NULL).
 *
 * Usage:
 *   pnpm -C apps/api run seed:design-director-skills
 *   pnpm -C apps/api run seed:design-director-skill-bindings   # tool bindings + v2 prompts
 *   pnpm -C apps/api run audit:design-director-skills          # verify
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
    name: 'design-critique',
    category: 'design',
    description: '设计稿评审、一致性检查与可执行修改建议',
    requiredPermissions: ['design:critique', 'read:assets'],
    metadata: {
      author: 'Foundry Team',
      tags: ['design', 'critique', 'ux'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['design', 'creative'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: design-critique
version: 1.0
description: 设计稿评审、一致性检查与可执行修改建议
---

**指令**：作为设计总监，对交付的设计稿进行结构化评审。

**输出 JSON**：
{
  "artifactId": string,
  "overallScore": number,
  "dimensions": [{ "name": string, "score": number, "notes": string }],
  "blockingIssues": string[],
  "suggestedChanges": string[],
  "approved": boolean
}`,
  },
  {
    name: 'accessibility-pass',
    category: 'design',
    description: '无障碍（a11y）合规检查与修复清单',
    requiredPermissions: ['design:accessibility'],
    metadata: {
      author: 'Foundry Team',
      tags: ['design', 'accessibility', 'a11y'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['design'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: accessibility-pass
version: 1.0
description: 无障碍合规检查与修复清单
---

**指令**：按 WCAG 2.1 AA 基线检查界面/原型，输出可执行修复项。

**输出 JSON**：
{
  "complianceLevel": "AA|AAA|partial",
  "violations": [{ "rule": string, "severity": string, "location": string, "fix": string }],
  "passedChecks": string[],
  "readyForRelease": boolean
}`,
  },
  {
    name: 'design-system-auditor',
    category: 'design',
    description: '设计系统组件与 Token 一致性审计',
    requiredPermissions: ['design:system'],
    metadata: {
      author: 'Foundry Team',
      tags: ['design', 'design-system'],
      costLevel: 'low',
      targetRole: ['director'],
      departmentRoles: ['design'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: design-system-auditor
version: 1.0
description: 设计系统组件与 Token 一致性审计
---

**输出 JSON**：
{
  "driftScore": number,
  "offSpecComponents": string[],
  "tokenMisuse": string[],
  "remediationPlan": string[]
}`,
  },
  {
    name: 'ux-flow-mapper',
    category: 'design',
    description: '用户旅程与关键流程梳理，识别体验断点',
    requiredPermissions: ['design:ux'],
    metadata: {
      author: 'Foundry Team',
      tags: ['design', 'ux', 'journey'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['design', 'product'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: ux-flow-mapper
version: 1.0
description: 用户旅程与关键流程梳理
---

**输出 JSON**：
{
  "persona": string,
  "journeyStages": [{ "stage": string, "actions": string[], "painPoints": string[], "opportunities": string[] }],
  "criticalPath": string[],
  "recommendedExperiments": string[]
}`,
  },
  {
    name: 'visual-handoff-packager',
    category: 'design',
    description: '为工程/产品生成可落地的视觉交付包（标注、状态、切图说明）',
    requiredPermissions: ['design:handoff'],
    metadata: {
      author: 'Foundry Team',
      tags: ['design', 'handoff', 'engineering'],
      costLevel: 'medium',
      targetRole: ['director'],
      departmentRoles: ['design'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: visual-handoff-packager
version: 1.0
description: 视觉交付包生成
---

**输出 JSON**：
{
  "featureName": string,
  "screens": [{ "name": string, "states": string[], "spacingNotes": string[], "assetList": string[] }],
  "openQuestions": string[],
  "engineeringChecklist": string[]
}`,
  },
  {
    name: 'brand-consistency-checker',
    category: 'design',
    description: '品牌视觉规范符合度检查',
    requiredPermissions: ['design:brand'],
    metadata: {
      author: 'Foundry Team',
      tags: ['design', 'brand'],
      costLevel: 'low',
      targetRole: ['director'],
      departmentRoles: ['design', 'creative', 'marketing'],
    },
    toolSchema: { type: 'object', additionalProperties: true, properties: {} },
    promptTemplate: `---
name: brand-consistency-checker
version: 1.0
description: 品牌视觉规范符合度检查
---

**输出 JSON**：
{
  "brandScore": number,
  "violations": string[],
  "approvedElements": string[],
  "revisionBrief": string
}`,
  },
];

async function main() {
  loadEnvFromFile();
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
