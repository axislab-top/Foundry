/**
 * Seed platform-global Skill for department director subordinate deliverable review (idempotent).
 *
 * What it creates/updates (company_id IS NULL):
 * - Skill: director-subordinate-reviewer
 * - Binding: skill -> tool.organization_node_agents
 *
 * Prerequisite:
 * - Tool `organization_node_agents` exists (seed:director-roster-tool).
 *
 * Usage:
 *   pnpm -C apps/api run seed:director-subordinate-reviewer
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
const SKILL_NAME = 'director-subordinate-reviewer';

const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nodeId', 'deliverables'],
  properties: {
    nodeId: { type: 'string', description: 'Department organization node id (UUID)' },
    includeSelf: { type: 'boolean', default: true },
    reviewStandard: { type: 'string', description: 'Optional review rubric (quality/completeness/risk)' },
    deliverables: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ownerAgentId', 'title', 'content'],
        properties: {
          ownerAgentId: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          expectedCriteria: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['departmentNodeId', 'roster', 'reviews', 'summary', 'needsEscalation'],
  properties: {
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
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ownerAgentId', 'title', 'decision', 'score', 'feedback'],
        properties: {
          ownerAgentId: { type: 'string' },
          title: { type: 'string' },
          decision: { type: 'string', enum: ['approved', 'revise_required', 'rejected'] },
          score: { type: 'number', minimum: 0, maximum: 100 },
          feedback: { type: 'array', items: { type: 'string' } },
          requiredActions: { type: 'array', items: { type: 'string' } },
          deadline: { type: 'string' },
        },
      },
    },
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['approved', 'reviseRequired', 'rejected'],
      properties: {
        approved: { type: 'number' },
        reviseRequired: { type: 'number' },
        rejected: { type: 'number' },
      },
    },
    needsEscalation: { type: 'boolean' },
    escalationReason: { type: 'string' },
  },
};

const PROMPT_TEMPLATE = `---
name: ${SKILL_NAME}
version: 1.0
description: Director reviews subordinate deliverables with roster validation
---

你是部门主管，负责审核下属交付质量并给出可执行反馈。

强制流程（必须遵守）：
1) 先调用 tool.${TOOL_NAME} 获取部门成员 roster，校验 deliverables[].ownerAgentId 是否属于本部门。
2) 对每个交付输出审核结论：approved / revise_required / rejected。
3) feedback 必须具体可执行；禁止空泛评价。
4) 仅输出纯 JSON，不输出 markdown，不输出解释文字。

输出 JSON 结构：
{
  "departmentNodeId":"...",
  "roster":[{"agentId":"...","agentName":"...","role":"..."}],
  "reviews":[
    {
      "ownerAgentId":"...",
      "title":"...",
      "decision":"approved|revise_required|rejected",
      "score":88,
      "feedback":["..."],
      "requiredActions":["..."],
      "deadline":"..."
    }
  ],
  "summary":{"approved":1,"reviseRequired":2,"rejected":0},
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
          '主管-下属交付审核器',
          '审核下属交付质量并输出结构化结论与整改动作',
          JSON.stringify(INPUT_SCHEMA),
          JSON.stringify(OUTPUT_SCHEMA),
          PROMPT_TEMPLATE,
          JSON.stringify(['read:organization']),
          'seed director subordinate reviewer skill',
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
          '主管-下属交付审核器',
          '审核下属交付质量并输出结构化结论与整改动作',
          JSON.stringify(INPUT_SCHEMA),
          JSON.stringify(OUTPUT_SCHEMA),
          PROMPT_TEMPLATE,
          JSON.stringify(['read:organization']),
          'seed director subordinate reviewer skill',
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

