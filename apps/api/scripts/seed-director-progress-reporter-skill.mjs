/**
 * Seed platform-global Skill for department director progress reporting (idempotent by name).
 *
 * What it creates/updates (company_id IS NULL):
 * - Skill: director-progress-reporter
 * - Binding: skill -> tool.organization_node_agents
 *
 * Prerequisite:
 * - Tool `organization_node_agents` must already exist (created by seed:director-roster-tool).
 *
 * Usage:
 *   pnpm -C apps/api run seed:director-progress-reporter
 *
 * Env:
 *   DATABASE_URL (preferred) or POSTGRES/DB env fallback
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
const SKILL_NAME = 'director-progress-reporter';

const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId', 'reportPeriod', 'goalSummary'],
  properties: {
    nodeId: { type: 'string', description: 'Department organization node id (UUID)' },
    reportPeriod: { type: 'string', description: 'e.g. daily/weekly/biweekly' },
    goalSummary: { type: 'string' },
    includeSelf: { type: 'boolean', default: true },
    context: { type: 'string' },
  },
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'reportPeriod',
    'departmentNodeId',
    'departmentRoster',
    'progressSummary',
    'keyRisks',
    'nextActions',
    'needsEscalation',
  ],
  properties: {
    reportPeriod: { type: 'string' },
    departmentNodeId: { type: 'string' },
    departmentRoster: {
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
    progressSummary: {
      type: 'object',
      additionalProperties: false,
      required: ['completed', 'inProgress', 'blocked'],
      properties: {
        completed: { type: 'array', items: { type: 'string' } },
        inProgress: { type: 'array', items: { type: 'string' } },
        blocked: { type: 'array', items: { type: 'string' } },
      },
    },
    keyRisks: { type: 'array', items: { type: 'string' } },
    nextActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'ownerAgentId', 'deadline'],
        properties: {
          action: { type: 'string' },
          ownerAgentId: { type: 'string' },
          deadline: { type: 'string' },
        },
      },
    },
    needsEscalation: { type: 'boolean' },
    escalationReason: { type: 'string' },
  },
};

const PROMPT_TEMPLATE = `---
name: ${SKILL_NAME}
version: 1.0
description: Department director progress reporting with mandatory roster lookup
---

你是部门主管，负责输出可提交给 CEO 的结构化进度汇报。

强制流程（必须遵守）：
1) 先调用 tool.${TOOL_NAME} 获取部门成员列表。
   - 入参 nodeId：使用输入中的 nodeId。
   - 若缺少 nodeId，输出 JSON 说明缺失并请求提供，禁止编造。
2) 汇总进展时，不得臆造成员状态；缺失数据请标记“待补充”。
3) 仅输出纯 JSON，不输出 markdown，不输出解释文字。

输出 JSON 结构：
{
  "reportPeriod": "...",
  "departmentNodeId": "...",
  "departmentRoster": [{"agentId":"...","agentName":"...","role":"..."}],
  "progressSummary": {
    "completed": ["..."],
    "inProgress": ["..."],
    "blocked": ["..."]
  },
  "keyRisks": ["..."],
  "nextActions": [{
    "action": "...",
    "ownerAgentId": "...",
    "deadline": "..."
  }],
  "needsEscalation": true,
  "escalationReason": "..."
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
          '主管-进度汇报器',
          '汇总部门成员进展、风险与下一步行动，输出结构化汇报',
          JSON.stringify(INPUT_SCHEMA),
          JSON.stringify(OUTPUT_SCHEMA),
          PROMPT_TEMPLATE,
          JSON.stringify(['read:organization']),
          'seed director progress reporter skill',
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
          '主管-进度汇报器',
          '汇总部门成员进展、风险与下一步行动，输出结构化汇报',
          JSON.stringify(INPUT_SCHEMA),
          JSON.stringify(OUTPUT_SCHEMA),
          PROMPT_TEMPLATE,
          JSON.stringify(['read:organization']),
          'seed director progress reporter skill',
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
          note: 'Bind this skill to director agents (or set as director role default) to enforce roster-aware reporting.',
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

