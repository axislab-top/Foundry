/**
 * Seed platform skill `collab-room-peer-summon` + CEO replay / director bindings.
 *
 * Usage:
 *   pnpm --filter @service/api run seed:collab-room-peer-summon
 *
 * Prerequisites:
 *   seed:director-roster-tool, seed:director-core-execution-tools
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SKILL_NAME = 'collab-room-peer-summon';
const TOOL_NAMES = ['organization_node_agents', 'message_send_to_agent'];
const REPLAY_GLOBAL_SETTINGS_KEY = 'collab.replay.globalSettings';

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

const SKILL_PROMPT_TEMPLATE = `---
name: ${SKILL_NAME}
version: 1.0
description: 主群点名同事接话 / 自我介绍（须先调工具再口头 @）
protocol: tool-bound-v2
---

你是协作群中的 Agent（CEO 或部门主管）。当需要在主群请同事接话、自我介绍、确认或汇报时，**必须**通过工具完成点名，禁止只口头说「请 XX 开始」而不调工具。

强制流程：
1) 若尚不确定目标 Agent 的 UUID，先调用 **tool.organization_node_agents**（或已知 id 则跳过）解析同事 id。
2) 再调用 **tool.message_send_to_agent**，参数须包含：
   - companyId、senderAgentId（你自己）、targetAgentId、content（协调话术，可含 @）
   - expectReply 默认 true（唤醒对方在主群回复）
3) 工具返回 summonAccepted 后，方可在可见层简短说「请 @XX …」；内容与 tool 一致。
4) 用户要求「依次」时：**每轮 tool 只 summon 一人**；多人在同一 LLM 回合内通过 tool loop 多轮继续，不要一次 tool 传多人。
5) 禁止编造 tool 结果；禁止对自己 senderAgentId === targetAgentId 发 summon。

与 director-task-delegator 分工：本 skill 管群聊接话/自我介绍；派活走 task 类 skill。
`;

async function upsertSkill(client) {
  const existing = await client.query(
    `select id from skills where company_id is null and name = $1 limit 1`,
    [SKILL_NAME],
  );
  if (existing.rowCount === 0) {
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
        'builtin', $6::jsonb, $7::jsonb, 'safe',
        true, 'none', null, $8,
        1, '1.0.0', true, true, true, $9::jsonb
      )
      returning id
      `,
      [
        SKILL_NAME,
        '协作-主群点名接话',
        '主群内通过 message_send_to_agent 点名同事接话/自我介绍（须先解析 id）',
        JSON.stringify({ type: 'object', additionalProperties: true }),
        SKILL_PROMPT_TEMPLATE,
        JSON.stringify({ executionMode: 'prompt_completion' }),
        JSON.stringify(['collaboration:send', 'read:organization']),
        'seed collab-room-peer-summon',
        JSON.stringify({ protocol: 'tool-bound-v2' }),
      ],
    );
    return ins.rows[0].id;
  }
  const id = existing.rows[0].id;
  await client.query(
    `
    update skills set
      display_name = $2,
      description = $3,
      prompt_template = $4,
      handler_config = coalesce(handler_config, '{}'::jsonb) || $5::jsonb,
      metadata = coalesce(metadata, '{}'::jsonb) || $6::jsonb,
      is_enabled = true,
      change_reason = $7,
      updated_at = current_timestamp,
      version = version + 1
    where company_id is null and name = $1
    `,
    [
      SKILL_NAME,
      '协作-主群点名接话',
      '主群内通过 message_send_to_agent 点名同事接话/自我介绍（须先解析 id）',
      SKILL_PROMPT_TEMPLATE,
      JSON.stringify({ executionMode: 'prompt_completion' }),
      JSON.stringify({ protocol: 'tool-bound-v2' }),
      'seed collab-room-peer-summon',
    ],
  );
  return id;
}

async function bindTools(client, skillId, toolByName) {
  let pos = 10;
  for (const name of TOOL_NAMES) {
    const toolId = toolByName.get(name);
    if (!toolId) throw new Error(`Missing tool: ${name}`);
    await client.query(
      `
      insert into skill_tool_bindings (id, company_id, skill_id, tool_id, position, is_overridden, config_override, created_by)
      values (gen_random_uuid(), null, $1, $2, $3, false, null, null)
      on conflict (skill_id, tool_id) do update set position = excluded.position
      `,
      [skillId, toolId, pos],
    );
    pos += 1;
  }
}

function mergeSkillIds(existing, skillId) {
  const ids = Array.isArray(existing)
    ? existing.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  if (!ids.includes(skillId)) ids.push(skillId);
  return ids;
}

async function mergeReplaySkillIds(client, skillId) {
  const row = await client.query(`select value from platform_settings where key = $1 limit 1`, [
    REPLAY_GLOBAL_SETTINGS_KEY,
  ]);
  const cur =
    row.rowCount && row.rows[0].value && typeof row.rows[0].value === 'object'
      ? row.rows[0].value
      : {};
  const next = { ...cur, skillIds: mergeSkillIds(cur.skillIds, skillId) };
  await client.query(
    `
    insert into platform_settings (key, value, updated_at)
    values ($1, $2::jsonb, current_timestamp)
    on conflict (key) do update set value = excluded.value, updated_at = current_timestamp
    `,
    [REPLAY_GLOBAL_SETTINGS_KEY, JSON.stringify(next)],
  );

  const companies = await client.query(`select company_id, ceo_layer_config from company_ceo_layer_configs`);
  for (const c of companies.rows) {
    const cfg = c.ceo_layer_config && typeof c.ceo_layer_config === 'object' ? { ...c.ceo_layer_config } : {};
    const strategy = cfg.strategy && typeof cfg.strategy === 'object' ? { ...cfg.strategy } : {};
    const contextPolicy =
      strategy.contextPolicy && typeof strategy.contextPolicy === 'object'
        ? { ...strategy.contextPolicy }
        : {};
    const replay =
      contextPolicy.replay && typeof contextPolicy.replay === 'object'
        ? { ...contextPolicy.replay }
        : {};
    replay.skillIds = mergeSkillIds(replay.skillIds, skillId);
    await client.query(
      `update company_ceo_layer_configs set ceo_layer_config = $2::jsonb, updated_at = current_timestamp where company_id = $1`,
      [
        c.company_id,
        JSON.stringify({
          ...cfg,
          strategy: { ...strategy, contextPolicy: { ...contextPolicy, replay } },
        }),
      ],
    );
  }

  const ma = await client.query(`select id, ceo_layer_config from marketplace_agents where slug = 'ceo' limit 1`);
  if (ma.rowCount) {
    const cfg =
      ma.rows[0].ceo_layer_config && typeof ma.rows[0].ceo_layer_config === 'object'
        ? { ...ma.rows[0].ceo_layer_config }
        : {};
    const strategy = cfg.strategy && typeof cfg.strategy === 'object' ? { ...cfg.strategy } : {};
    const contextPolicy =
      strategy.contextPolicy && typeof strategy.contextPolicy === 'object'
        ? { ...strategy.contextPolicy }
        : {};
    const replay =
      contextPolicy.replay && typeof contextPolicy.replay === 'object'
        ? { ...contextPolicy.replay }
        : {};
    replay.skillIds = mergeSkillIds(replay.skillIds, skillId);
    await client.query(
      `update marketplace_agents set ceo_layer_config = $2::jsonb, updated_at = current_timestamp where id = $1`,
      [
        ma.rows[0].id,
        JSON.stringify({
          ...cfg,
          strategy: { ...strategy, contextPolicy: { ...contextPolicy, replay } },
        }),
      ],
    );
  }
}

async function bindAgentSkills(client, skillId) {
  const agentsRes = await client.query(
    `
    select id, company_id
    from agents
    where role in ('ceo', 'director')
    `,
  );
  let inserted = 0;
  for (const row of agentsRes.rows) {
    const r = await client.query(
      `
      insert into agent_skills (company_id, agent_id, skill_id, created_at)
      values ($1, $2, $3, current_timestamp)
      on conflict (agent_id, skill_id) do nothing
      `,
      [row.company_id, row.id, skillId],
    );
    inserted += Number(r.rowCount ?? 0);
  }
  return { agentCount: agentsRes.rowCount ?? 0, inserted };
}

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
    const missingTools = TOOL_NAMES.filter((n) => !toolByName.has(n));
    if (missingTools.length) {
      throw new Error(`Missing tools: ${missingTools.join(', ')}. Run director tool seeds first.`);
    }

    const skillId = await upsertSkill(client);
    await bindTools(client, skillId, toolByName);
    await mergeReplaySkillIds(client, skillId);
    const agentBindings = await bindAgentSkills(client, skillId);

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          ok: true,
          skill: { name: SKILL_NAME, id: skillId },
          tools: TOOL_NAMES,
          replaySkillIdsMerged: true,
          agentBindings,
          note: 'Restart API + Worker after seed so skill snapshots refresh.',
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
