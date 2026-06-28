/**
 * Seed platform-global Skill for department director team performance coaching (idempotent).
 *
 * What it creates/updates (company_id IS NULL):
 * - Skill: director-team-performance-coach
 * - Binding: skill -> tool.organization_node_agents
 *
 * Prerequisite:
 * - Tool `organization_node_agents` exists (seed:director-roster-tool).
 *
 * Usage:
 *   pnpm -C apps/api run seed:director-team-performance-coach
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

const TOOL_NAME = 'organization_node_agents';
const SKILL_NAME = 'director-team-performance-coach';

const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId', 'period', 'teamMetrics'],
  properties: {
    nodeId: { type: 'string', description: 'Department organization node id (UUID)' },
    includeSelf: { type: 'boolean', default: true },
    period: { type: 'string', description: 'e.g. weekly/monthly/quarterly' },
    teamMetrics: {
      type: 'object',
      additionalProperties: true,
      properties: {
        goalCompletionRate: { type: 'number' },
        avgCycleTime: { type: 'number' },
        qualityScore: { type: 'number' },
        onTimeRate: { type: 'number' },
      },
    },
    memberSignals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['agentId'],
        properties: {
          agentId: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          blockers: { type: 'array', items: { type: 'string' } },
          recentPerformanceScore: { type: 'number' },
        },
      },
    },
  },
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['period', 'departmentNodeId', 'roster', 'teamAssessment', 'memberCoachingPlans', 'managerActions'],
  properties: {
    period: { type: 'string' },
    departmentNodeId: { type: 'string' },
    roster: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['agentId', 'agentName', 'role'],
        properties: {
          agentId: { type: 'string' },
          agentName: { type: 'string' },
          role: { type: 'string' },
        },
      },
    },
    teamAssessment: {
      type: 'object',
      additionalProperties: false,
      required: ['overallScore', 'strengths', 'risks'],
      properties: {
        overallScore: { type: 'number', minimum: 0, maximum: 100 },
        strengths: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
      },
    },
    memberCoachingPlans: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['agentId', 'focusAreas', 'actions', 'targetMetric', 'reviewAt'],
        properties: {
          agentId: { type: 'string' },
          focusAreas: { type: 'array', items: { type: 'string' } },
          actions: { type: 'array', items: { type: 'string' } },
          targetMetric: { type: 'string' },
          reviewAt: { type: 'string' },
        },
      },
    },
    managerActions: {
      type: 'array',
      items: { type: 'string' },
    },
    needsEscalation: { type: 'boolean' },
    escalationReason: { type: 'string' },
  },
};

const PROMPT_TEMPLATE = `---
name: ${SKILL_NAME}
version: 1.0
description: Director team performance coaching with roster validation
---

你是部门主管，负责评估团队表现并制定可执行教练计划。

强制流程（必须遵守）：
1) 先调用 tool.${TOOL_NAME} 获取部门成员 roster，所有 memberCoachingPlans.agentId 必须来自 roster。
2) 基于输入指标与成员信号给出“可执行”的教练动作与复盘时间。
3) 禁止编造成员、禁止空泛建议（例如“继续努力”）。
4) 仅输出纯 JSON，不输出 markdown，不输出解释文字。

输出 JSON 结构：
{
  "period":"...",
  "departmentNodeId":"...",
  "roster":[{"agentId":"...","agentName":"...","role":"..."}],
  "teamAssessment":{
    "overallScore":78,
    "strengths":["..."],
    "risks":["..."]
  },
  "memberCoachingPlans":[
    {
      "agentId":"...",
      "focusAreas":["..."],
      "actions":["..."],
      "targetMetric":"...",
      "reviewAt":"..."
    }
  ],
  "managerActions":["..."],
  "needsEscalation":false,
  "escalationReason":"..."
}
`;

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');

    const tool = await client.query(
      `select id from tools where company_id is null and name = $1 limit 1`,
      [TOOL_NAME],
    );
    if (tool.rowCount === 0) {
      throw new Error(
        `Required tool '${TOOL_NAME}' not found. Run: pnpm -C apps/api run seed:director-roster-tool`,
      );
    }
    const toolId = tool.rows[0].id;

    const skillRes = await client.query(
      `select id from skills where company_id is null and name = $1 limit 1`,
      [SKILL_NAME],
    );

    let skillId;
    if (skillRes.rowCount === 0) {
      const ins = await client.query(
        `
        insert into skills (
          id, company_id, name, display_name, description,
          tool_schema, input_schema, output_schema, prompt_template,
          implementation_type, handler_config, required_permissions, security_profile,
          is_enabled, approval_status, approval_request_id, change_reason,
          version, semver_version, is_latest, is_public, is_system, metadata
        ) values (
          gen_random_uuid(), null, $1, $2, $3,
          $4::jsonb, $4::jsonb, $5::jsonb, $6,
          'builtin', null, $7::jsonb, 'safe',
          true, 'none', null, $8,
          1, '1.0.0', true, true, true, '{}'::jsonb
        )
        returning id
        `,
        [
          SKILL_NAME,
          '主管-团队绩效教练',
          '评估团队与成员表现，输出结构化教练计划与管理动作',
          JSON.stringify(INPUT_SCHEMA),
          JSON.stringify(OUTPUT_SCHEMA),
          PROMPT_TEMPLATE,
          JSON.stringify(['read:organization']),
          'seed director team performance coach skill',
        ],
      );
      skillId = ins.rows[0].id;
    } else {
      skillId = skillRes.rows[0].id;
      await client.query(
        `
        update skills
        set
          display_name = $2,
          description = $3,
          tool_schema = $4::jsonb,
          input_schema = $4::jsonb,
          output_schema = $5::jsonb,
          prompt_template = $6,
          required_permissions = $7::jsonb,
          security_profile = 'safe',
          is_enabled = true,
          approval_status = 'none',
          approval_request_id = null,
          change_reason = $8,
          updated_at = current_timestamp,
          version = version + 1
        where company_id is null and name = $1
        `,
        [
          SKILL_NAME,
          '主管-团队绩效教练',
          '评估团队与成员表现，输出结构化教练计划与管理动作',
          JSON.stringify(INPUT_SCHEMA),
          JSON.stringify(OUTPUT_SCHEMA),
          PROMPT_TEMPLATE,
          JSON.stringify(['read:organization']),
          'seed director team performance coach skill',
        ],
      );
    }

    await client.query(
      `
      insert into skill_tool_bindings (id, company_id, skill_id, tool_id, position, is_overridden, config_override, created_by)
      values (gen_random_uuid(), null, $1, $2, 0, false, null, null)
      on conflict (skill_id, tool_id) do nothing
      `,
      [skillId, toolId],
    );

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          ok: true,
          skill: { name: SKILL_NAME, id: skillId },
          boundTool: { name: TOOL_NAME, id: toolId },
        },
        null,
        2,
      ),
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

