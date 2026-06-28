/**
 * Seed director core execution tools and bind them to director universal skills.
 *
 * Creates/updates platform-global tools:
 * - task_create_and_assign
 * - task_list_by_department
 * - message_send_to_agent
 *
 * Then binds tools to existing global skills:
 * - director-task-delegator          -> organization_node_agents, task_create_and_assign, message_send_to_agent
 * - director-progress-reporter       -> organization_node_agents, task_list_by_department
 * - director-subordinate-reviewer    -> organization_node_agents, task_list_by_department, message_send_to_agent
 * - director-team-performance-coach  -> organization_node_agents, task_list_by_department, message_send_to_agent
 *
 * Usage:
 *   pnpm -C apps/api run seed:director-core-execution-tools
 *
 * Env:
 *   DATABASE_URL (preferred) or POSTGRES/DB env fallback
 *   TOOL_INTERNAL_BASE_URL (required): e.g. http://localhost:3000
 *   API_INTERNAL_AUTH_SECRET (required)
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
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[k] === undefined) process.env[k] = v;
      }
      break;
    } catch {}
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

function buildTools(baseUrl, token) {
  const root = baseUrl.replace(/\/$/, '');
  return [
    {
      name: 'task_create_and_assign',
      displayName: '任务-创建并指派',
      description: '创建任务并直接指派给指定 Agent',
      handlerConfig: {
        kind: 'http',
        method: 'POST',
        url: `${root}/internal/tools/tasks/create-and-assign?token=${encodeURIComponent(token)}`,
        headers: { 'content-type': 'application/json' },
      },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['companyId', 'title', 'assigneeAgentId'],
        properties: {
          companyId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          assigneeAgentId: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          dueDate: { type: 'string' },
          expectedOutput: { type: 'string' },
          metadata: { type: 'object' },
        },
      },
      outputSchema: {
        type: 'object',
        additionalProperties: true,
        properties: { ok: { type: 'boolean' }, task: { type: 'object' } },
      },
      requiredPermissions: ['tasks:write'],
    },
    {
      name: 'task_list_by_department',
      displayName: '任务-按部门查询',
      description: '按部门组织节点查询任务列表和状态分布',
      handlerConfig: {
        kind: 'http',
        method: 'POST',
        url: `${root}/internal/tools/tasks/list-by-department?token=${encodeURIComponent(token)}`,
        headers: { 'content-type': 'application/json' },
      },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['companyId', 'departmentNodeId'],
        properties: {
          companyId: { type: 'string' },
          departmentNodeId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'review', 'awaiting_approval', 'completed', 'blocked', 'cancelled', 'paused'],
          },
          page: { type: 'number' },
          pageSize: { type: 'number' },
        },
      },
      outputSchema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          items: { type: 'array' },
          total: { type: 'number' },
        },
      },
      requiredPermissions: ['tasks:read'],
    },
    {
      name: 'message_send_to_agent',
      displayName: '协作-发送消息给成员',
      description: '向指定 Agent 发送协调消息并以调用方 Agent 身份写入主群（可异步唤醒对方回复）',
      handlerConfig: {
        kind: 'http',
        method: 'POST',
        url: `${root}/internal/tools/collaboration/send-to-agent?token=${encodeURIComponent(token)}`,
        headers: { 'content-type': 'application/json' },
      },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['companyId', 'targetAgentId', 'content', 'senderAgentId'],
        properties: {
          companyId: { type: 'string' },
          targetAgentId: { type: 'string' },
          content: { type: 'string' },
          senderAgentId: { type: 'string', description: '调用方 Agent UUID（主群气泡身份）' },
          roomId: { type: 'string' },
          expectReply: { type: 'boolean', default: true, description: '是否异步唤醒目标 Agent 回复' },
          threadId: { type: 'string' },
          anchorMessageId: { type: 'string' },
          senderUserId: { type: 'string', description: 'deprecated: use senderAgentId' },
          metadata: { type: 'object' },
        },
      },
      outputSchema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          roomId: { type: 'string' },
          messageId: { type: 'string' },
          summonAccepted: { type: 'boolean' },
        },
      },
      requiredPermissions: ['collaboration:send'],
    },
  ];
}

async function upsertTool(client, t) {
  const existing = await client.query(`select id from tools where company_id is null and name = $1 limit 1`, [t.name]);
  if (existing.rowCount === 0) {
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
        1, '1.0.0', 'none', null, 'seed director core execution tools'
      )
      returning id
      `,
      [
        t.name,
        t.displayName,
        t.description,
        JSON.stringify(t.handlerConfig),
        JSON.stringify(t.inputSchema),
        JSON.stringify(t.outputSchema ?? null),
        JSON.stringify(t.requiredPermissions ?? []),
      ],
    );
    return ins.rows[0].id;
  }
  const id = existing.rows[0].id;
  await client.query(
    `
    update tools
    set
      display_name = $2,
      description = $3,
      implementation_type = 'builtin',
      handler_config = $4::jsonb,
      input_schema = $5::jsonb,
      output_schema = $6::jsonb,
      security_profile = 'safe',
      required_permissions = $7::jsonb,
      is_enabled = true,
      approval_status = 'none',
      approval_request_id = null,
      change_reason = 'seed director core execution tools',
      version = version + 1,
      updated_at = current_timestamp
    where id = $1
    `,
    [
      id,
      t.displayName,
      t.description,
      JSON.stringify(t.handlerConfig),
      JSON.stringify(t.inputSchema),
      JSON.stringify(t.outputSchema ?? null),
      JSON.stringify(t.requiredPermissions ?? []),
    ],
  );
  return id;
}

async function bindTool(client, skillId, toolId, position) {
  await client.query(
    `
    insert into skill_tool_bindings (id, company_id, skill_id, tool_id, position, is_overridden, config_override, created_by)
    values (gen_random_uuid(), null, $1, $2, $3, false, null, null)
    on conflict (skill_id, tool_id) do update set position = excluded.position
    `,
    [skillId, toolId, position],
  );
}

async function main() {
  loadEnvFromFile();
  const baseUrl = requireEnv('TOOL_INTERNAL_BASE_URL');
  const token = requireEnv('API_INTERNAL_AUTH_SECRET');
  const tools = buildTools(baseUrl, token);
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');

    const toolIds = {};
    for (const t of tools) toolIds[t.name] = await upsertTool(client, t);

    const skills = await client.query(
      `select id, name from skills where company_id is null and name = any($1::text[])`,
      [[
        'director-task-delegator',
        'director-progress-reporter',
        'director-subordinate-reviewer',
        'director-team-performance-coach',
      ]],
    );
    const skillByName = new Map(skills.rows.map((r) => [r.name, r.id]));

    const requireSkill = (name) => {
      const id = skillByName.get(name);
      if (!id) throw new Error(`Required skill '${name}' not found. Seed it first.`);
      return id;
    };

    // delegator
    await bindTool(client, requireSkill('director-task-delegator'), toolIds['task_create_and_assign'], 10);
    await bindTool(client, requireSkill('director-task-delegator'), toolIds['message_send_to_agent'], 11);

    // reporter
    await bindTool(client, requireSkill('director-progress-reporter'), toolIds['task_list_by_department'], 10);

    // reviewer
    await bindTool(client, requireSkill('director-subordinate-reviewer'), toolIds['task_list_by_department'], 10);
    await bindTool(client, requireSkill('director-subordinate-reviewer'), toolIds['message_send_to_agent'], 11);

    // coach
    await bindTool(client, requireSkill('director-team-performance-coach'), toolIds['task_list_by_department'], 10);
    await bindTool(client, requireSkill('director-team-performance-coach'), toolIds['message_send_to_agent'], 11);

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          ok: true,
          tools: Object.entries(toolIds).map(([name, id]) => ({ name, id })),
          skillsBound: [...skillByName.keys()],
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

