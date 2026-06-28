/**
 * Seed platform-global HR onboarding skill aligned with current tool-binding protocol.
 *
 * Creates/updates:
 * - Skill: hr-agent-onboarding-kit
 * - Bindings:
 *   - tool.organization_node_agents
 *   - tool.task_create_and_assign
 *   - tool.message_send_to_agent
 *
 * Usage:
 *   pnpm -C apps/api run seed:hr-agent-onboarding-kit
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

const SKILL_NAME = 'hr-agent-onboarding-kit';
const TOOL_NAMES = ['organization_node_agents', 'task_create_and_assign', 'message_send_to_agent'];

const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['companyId', 'hrDepartmentNodeId', 'newAgentProfile'],
  properties: {
    companyId: { type: 'string', description: 'Company UUID' },
    hrDepartmentNodeId: { type: 'string', description: 'HR department organization node UUID' },
    newAgentProfile: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'targetDepartmentNodeId', 'targetRole'],
      properties: {
        name: { type: 'string' },
        targetDepartmentNodeId: { type: 'string' },
        targetRole: { type: 'string' },
        targetAgentId: { type: 'string', description: 'Optional: existing agent id if already created' },
        reportingToAgentId: { type: 'string' },
        initialSkills: { type: 'array', items: { type: 'string' } },
      },
    },
    firstWeekGoals: { type: 'array', items: { type: 'string' } },
    onboardingDeadline: { type: 'string' },
  },
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'onboardingPlan',
    'createdTasks',
    'notifications',
    'handoverChecklist',
    'onboardingComplete',
  ],
  properties: {
    onboardingPlan: {
      type: 'object',
      additionalProperties: false,
      required: ['ownerAgentId', 'timeline', 'successCriteria'],
      properties: {
        ownerAgentId: { type: 'string' },
        timeline: { type: 'array', items: { type: 'string' } },
        successCriteria: { type: 'array', items: { type: 'string' } },
      },
    },
    createdTasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'assigneeAgentId', 'purpose'],
        properties: {
          title: { type: 'string' },
          assigneeAgentId: { type: 'string' },
          purpose: { type: 'string' },
          taskId: { type: 'string' },
        },
      },
    },
    notifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['targetAgentId', 'message'],
        properties: {
          targetAgentId: { type: 'string' },
          message: { type: 'string' },
          messageId: { type: 'string' },
        },
      },
    },
    handoverChecklist: { type: 'array', items: { type: 'string' } },
    onboardingComplete: { type: 'boolean' },
    pendingItems: { type: 'array', items: { type: 'string' } },
  },
};

const PROMPT_TEMPLATE = `---
name: ${SKILL_NAME}
version: 2.0
description: HR onboarding workflow with executable tool calls
---

你是 HR Director，负责新 Agent 的标准化入职落地。

强制协议（必须遵守）：
1) 先调用 tool.organization_node_agents：
   - 查询 hrDepartmentNodeId 的成员，用于选择 onboarding owner。
2) 使用 tool.task_create_and_assign 创建至少 2 个入职任务：
   - 必须包含：welcome/onboarding briefing、first-week goal alignment。
3) 使用 tool.message_send_to_agent 发送至少 1 条通知：
   - 至少通知 onboarding owner；如给了 reportingToAgentId，也要通知直属上级。
4) 输出仅为纯 JSON，不得输出 markdown，不得编造 tool 调用结果。

输出 JSON：
{
  "onboardingPlan": {
    "ownerAgentId": "...",
    "timeline": ["..."],
    "successCriteria": ["..."]
  },
  "createdTasks": [
    {"title":"...","assigneeAgentId":"...","purpose":"...","taskId":"..."}
  ],
  "notifications": [
    {"targetAgentId":"...","message":"...","messageId":"..."}
  ],
  "handoverChecklist": ["..."],
  "onboardingComplete": false,
  "pendingItems": ["..."]
}
`;

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');

    const toolRows = await client.query(
      `select id, name from tools where company_id is null and name = any($1::text[])`,
      [TOOL_NAMES],
    );
    const toolByName = new Map(toolRows.rows.map((r) => [r.name, r.id]));
    for (const n of TOOL_NAMES) {
      if (!toolByName.has(n)) {
        throw new Error(`Required tool '${n}' not found. Run seed:director-core-execution-tools first.`);
      }
    }

    const skill = await client.query(
      `select id from skills where company_id is null and name = $1 limit 1`,
      [SKILL_NAME],
    );
    let skillId;
    if (skill.rowCount === 0) {
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
          1, '1.0.0', true, true, true, $9::jsonb
        )
        returning id
        `,
        [
          SKILL_NAME,
          'HR-新员工入职工具包',
          '执行式入职流程：查成员、建任务、发通知、输出入职检查清单',
          JSON.stringify(INPUT_SCHEMA),
          JSON.stringify(OUTPUT_SCHEMA),
          PROMPT_TEMPLATE,
          JSON.stringify(['hr:onboarding', 'tasks:write', 'collaboration:send', 'read:organization']),
          'seed hr onboarding kit v2',
          JSON.stringify({
            author: 'Foundry Team',
            tags: ['hr', 'onboarding', 'agent-management'],
            targetRole: ['director'],
            departmentRoles: ['people', 'hr', 'human-resources'],
            protocol: 'tool-bound-v2',
          }),
        ],
      );
      skillId = ins.rows[0].id;
    } else {
      skillId = skill.rows[0].id;
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
          metadata = coalesce(metadata, '{}'::jsonb) || $9::jsonb,
          updated_at = current_timestamp,
          version = version + 1
        where company_id is null and name = $1
        `,
        [
          SKILL_NAME,
          'HR-新员工入职工具包',
          '执行式入职流程：查成员、建任务、发通知、输出入职检查清单',
          JSON.stringify(INPUT_SCHEMA),
          JSON.stringify(OUTPUT_SCHEMA),
          PROMPT_TEMPLATE,
          JSON.stringify(['hr:onboarding', 'tasks:write', 'collaboration:send', 'read:organization']),
          'seed hr onboarding kit v2',
          JSON.stringify({ protocol: 'tool-bound-v2' }),
        ],
      );
    }

    const bindings = [
      ['organization_node_agents', 0],
      ['task_create_and_assign', 10],
      ['message_send_to_agent', 11],
    ];
    for (const [name, position] of bindings) {
      const toolId = toolByName.get(name);
      await client.query(
        `
        insert into skill_tool_bindings (id, company_id, skill_id, tool_id, position, is_overridden, config_override, created_by)
        values (gen_random_uuid(), null, $1, $2, $3, false, null, null)
        on conflict (skill_id, tool_id) do update set position = excluded.position
        `,
        [skillId, toolId, position],
      );
    }

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          ok: true,
          skill: { name: SKILL_NAME, id: skillId },
          tools: TOOL_NAMES,
          note: 'Bind this skill to HR director agent or configure as role default.',
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

