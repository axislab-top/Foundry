/**
 * Seed platform-global Tool + Skill for department director roster lookup (idempotent by name).
 *
 * What it creates/updates (company_id IS NULL):
 * - Tool: organization_node_agents  (runtime tool name: tool.organization_node_agents)
 * - Skill: director-task-delegator  (binds above Tool)
 *
 * Why:
 * - Department heads must be able to discover department members before task delegation.
 * - Runner sandbox HTTP invoke does NOT support custom headers; we authenticate internal endpoint with a query token.
 *
 * Usage:
 *   pnpm -C apps/api run seed:director-roster-tool
 *
 * Env:
 *   DATABASE_URL (preferred) or POSTGRES/DB env fallback
 *   TOOL_INTERNAL_BASE_URL (required): e.g. https://gateway.yourdomain.com/api
 *   API_INTERNAL_AUTH_SECRET (required): shared secret used as query param token
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
    join(__dirname, '../.env'),
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

function requireEnv(name) {
  const v = String(process.env[name] ?? '').trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const TOOL_NAME = 'organization_node_agents';
const SKILL_NAME = 'director-task-delegator';

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId'],
  properties: {
    nodeId: { type: 'string', description: 'Organization node UUID (department node id)' },
    includeSelf: { type: 'boolean', default: true },
  },
};

const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    companyId: { type: 'string' },
    nodeId: { type: 'string' },
    includeSelf: { type: 'boolean' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          agentId: { type: 'string' },
          agentName: { type: 'string' },
          role: { type: 'string' },
          organizationNodeId: { type: 'string' },
          organizationNodeName: { type: 'string' },
        },
      },
    },
  },
};

const SKILL_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['goal'],
  properties: {
    goal: { type: 'string', minLength: 1 },
    timeWindow: { type: 'string' },
    context: { type: 'string' },
    nodeId: { type: 'string', description: 'Department organization node id (UUID). Required for roster lookup.' },
  },
};

const SKILL_PROMPT_TEMPLATE = `---
name: ${SKILL_NAME}
version: 1.0
description: Department director task delegation with roster lookup
---

你是部门主管。你的任务是将目标拆解为可分发的子任务，并分配给本部门成员。

强制流程（必须遵守）：
1) 先调用工具 tool.${TOOL_NAME} 获取本部门成员列表（roster），再开始分配 owner。
   - 入参 nodeId：使用输入中的 nodeId（UUID）。如果没有 nodeId，先输出 JSON 说明缺少 nodeId 并请求提供，不要臆测。
2) 任务拆解为 3-7 项，每项包含：title、owner、deadline、acceptanceCriteria、priority。
3) 输出必须为“纯 JSON”，不要输出 markdown，不要输出解释文字。

输出 JSON 结构：
{
  "roster": [{"agentId": "...", "agentName": "...", "role": "..."}],
  "tasks": [{
    "title": "...",
    "ownerAgentId": "...",
    "deadline": "...",
    "priority": "P0|P1|P2",
    "acceptanceCriteria": ["..."],
    "dependencies": ["..."]
  }],
  "weeklyTop3": ["...","...","..."],
  "risks": ["..."],
  "nextReportAt": "..."
}
`;

async function main() {
  loadEnvFromFile();
  const baseUrl = requireEnv('TOOL_INTERNAL_BASE_URL').replace(/\/$/, '');
  const token = requireEnv('API_INTERNAL_AUTH_SECRET');
  const toolUrl = `${baseUrl}/internal/tools/organization/node-agents?token=${encodeURIComponent(token)}`;

  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');

    // 1) Upsert tool
    const toolRes = await client.query(
      `select id from tools where company_id is null and name = $1 limit 1`,
      [TOOL_NAME],
    );
    let toolId;
    if (toolRes.rowCount === 0) {
      const ins = await client.query(
        `
        insert into tools (
          id, company_id, name, display_name, description,
          implementation_type, handler_config, input_schema, output_schema,
          security_profile, required_permissions, is_enabled,
          version, semver_version, approval_status, approval_request_id, change_reason
        ) values (
          gen_random_uuid(), null, $1, $2, $3,
          'builtin', $4::jsonb, $5::jsonb, $6::jsonb,
          'safe', $7::jsonb, true,
          1, '1.0.0', 'none', null, $8
        )
        returning id
        `,
        [
          TOOL_NAME,
          '组织-查询节点成员',
          '查询指定组织节点（部门/小组）下的所有 Agent（供部门主管分配任务）',
          JSON.stringify({ kind: 'http', url: toolUrl, method: 'POST', headers: { 'content-type': 'application/json' } }),
          JSON.stringify(TOOL_INPUT_SCHEMA),
          JSON.stringify(TOOL_OUTPUT_SCHEMA),
          JSON.stringify(['read:organization']),
          'seed director roster tool',
        ],
      );
      toolId = ins.rows[0].id;
    } else {
      toolId = toolRes.rows[0].id;
      await client.query(
        `
        update tools
        set
          display_name = $2,
          description = $3,
          handler_config = $4::jsonb,
          input_schema = $5::jsonb,
          output_schema = $6::jsonb,
          security_profile = 'safe',
          required_permissions = $7::jsonb,
          is_enabled = true,
          approval_status = 'none',
          approval_request_id = null,
          change_reason = $8,
          updated_at = current_timestamp,
          version = version + 1
        where company_id is null and name = $1
        `,
        [
          TOOL_NAME,
          '组织-查询节点成员',
          '查询指定组织节点（部门/小组）下的所有 Agent（供部门主管分配任务）',
          JSON.stringify({ kind: 'http', url: toolUrl, method: 'POST', headers: { 'content-type': 'application/json' } }),
          JSON.stringify(TOOL_INPUT_SCHEMA),
          JSON.stringify(TOOL_OUTPUT_SCHEMA),
          JSON.stringify(['read:organization']),
          'seed director roster tool',
        ],
      );
    }

    // 2) Upsert skill
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
          $4::jsonb, $4::jsonb, null, $5,
          'builtin', null, $6::jsonb, 'safe',
          true, 'none', null, $7,
          1, '1.0.0', true, true, true, '{}'::jsonb
        )
        returning id
        `,
        [
          SKILL_NAME,
          '主管-任务拆解与分发',
          '先查询部门成员，再将目标拆解为可分发任务并指派负责人',
          JSON.stringify(SKILL_TOOL_SCHEMA),
          SKILL_PROMPT_TEMPLATE,
          JSON.stringify(['read:organization']),
          'seed director delegator skill',
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
          prompt_template = $5,
          required_permissions = $6::jsonb,
          security_profile = 'safe',
          is_enabled = true,
          approval_status = 'none',
          approval_request_id = null,
          change_reason = $7,
          updated_at = current_timestamp,
          version = version + 1
        where company_id is null and name = $1
        `,
        [
          SKILL_NAME,
          '主管-任务拆解与分发',
          '先查询部门成员，再将目标拆解为可分发任务并指派负责人',
          JSON.stringify(SKILL_TOOL_SCHEMA),
          SKILL_PROMPT_TEMPLATE,
          JSON.stringify(['read:organization']),
          'seed director delegator skill',
        ],
      );
    }

    // 3) Bind tool to skill (idempotent)
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
          tool: { name: TOOL_NAME, id: toolId, url: toolUrl },
          skill: { name: SKILL_NAME, id: skillId },
          note: 'Bind the skill to director agents (or set role default skills) to enable roster lookup before delegation.',
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

