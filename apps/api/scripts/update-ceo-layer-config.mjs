import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CEO_CORE_SKILL_NAMES } from './lib/ceo-core-skills.mjs';

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

const strategyPrompt = `你是一个极度高效、只做一件事的意图分类与路由器。
你的唯一职责是判断用户消息属于以下哪一类：

1. 简单对话（问候、确认、闲聊、简单咨询、状态询问）
2. 复杂执行（需要规划、任务拆解、决策、协调多个 Agent、审批、长期跟踪）

请严格按照以下格式输出 JSON，不要输出任何其他内容：

{
  "type": "simple" | "complex",
  "confidence": 0.0 ~ 1.0,
  "reason": "一句话说明你的判断依据"
}

判断原则：
- 如果用户只是打招呼、确认你在、问简单问题 -> simple
- 如果用户提出目标、任务、计划、需要思考或多步操作 -> complex
- 置信度要真实，不要过度自信`;

const orchestrationPrompt = `你是公司的 CEO 日常对话助手，性格友好、专业、反应迅速、略带温暖。

你的核心风格：
- 说话简洁自然，像一个高效且亲切的领导
- 擅长快速响应、给出清晰建议、适当鼓励
- 保持第一人称（我 = CEO）
- 当用户提出简单请求时，直接给出答案或小建议
- 当用户提出复杂需求时，礼貌引导："好的，我来帮你拆解一下..." 并建议走 Heavy 层处理

回复要求：
- 控制在 2-4 段以内
- 语气积极、专业、不啰嗦
- 可以适当使用表情或轻幽默，但不要过度
- 永远以用户目标为导向`;

const supervisionPrompt = `你是公司的 CEO 大脑，负责战略思考、任务拆解、资源协调和执行落地。

你的核心职责：
- 把模糊目标拆解成清晰、可执行的任务清单
- 进行多步推理、风险评估和优先级排序
- 协调各部门 Agent，分配责任和时间节点
- 当遇到高风险决策时，主动提出需要 Human-in-the-loop 审批

回复要求：
- 专业、结构化、逻辑严密
- 必须使用列表、步骤、时间线、责任人等格式
- 语气稳重、有领导力，但不独断
- 永远给出具体行动计划，而非模糊建议
- 如果信息不足，主动提问或要求补充

输出时请严格区分「思考过程」和「最终执行计划」。`;

/**
 * MCP-v1 definitions for tools bound to the given global skill IDs (platform rows).
 * Aligns ceo_layer_config.*.mcpTools with skill_mcp_tool_bindings + mcp_tools.
 */
async function fetchMcpToolsForSkillIds(client, skillIds) {
  const ids = skillIds.filter(Boolean);
  if (!ids.length) return [];
  const r = await client.query(
    `
    select distinct on (mt.name)
      mt.name,
      mt.description,
      mt.input_schema as "inputSchema",
      mt.output_schema as "outputSchema",
      mt.security_profile as "securityProfile"
    from skill_mcp_tool_bindings smb
    join skills s on s.id = smb.skill_id and s.company_id is null
    join mcp_tools mt on mt.id = smb.mcp_tool_id and mt.company_id is null
    where smb.skill_id = any($1::uuid[])
      and smb.company_id is null
      and mt.is_enabled = true
    order by mt.name, mt.updated_at desc nulls last
    `,
    [ids],
  );
  return r.rows.map((row) => ({
    name: row.name,
    description: typeof row.description === 'string' ? row.description : '',
    inputSchema:
      row.inputSchema && typeof row.inputSchema === 'object' ? row.inputSchema : { type: 'object', properties: {} },
    outputSchema: row.outputSchema && typeof row.outputSchema === 'object' ? row.outputSchema : null,
    securityProfile: typeof row.securityProfile === 'string' ? row.securityProfile : 'safe',
  }));
}

function unionMcpToolsByName(layers) {
  const out = [];
  const seen = new Set();
  for (const layer of layers) {
    const list = Array.isArray(layer?.mcpTools) ? layer.mcpTools : [];
    for (const t of list) {
      const n = t && typeof t === 'object' && typeof t.name === 'string' ? t.name : '';
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(t);
      }
    }
  }
  return out;
}

function assertNoLegacyLayerKeys(cfg, label) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return;
  const legacy = ['classifier', 'light', 'heavy'].filter((k) => Object.prototype.hasOwnProperty.call(cfg, k));
  if (legacy.length > 0) {
    throw new Error(
      `[${label}] contains legacy ceo_layer_config keys: ${legacy.join(', ')}. ` +
        `Only strategy/orchestration/supervision are allowed.`,
    );
  }
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const rows = await client.query(
      `select id, name from skills where company_id is null and name = any($1::text[])`,
      [CEO_CORE_SKILL_NAMES],
    );
    const byName = new Map(rows.rows.map((r) => [r.name, r.id]));
    const missing = CEO_CORE_SKILL_NAMES.filter((n) => !byName.has(n));
    if (missing.length > 0) {
      throw new Error(`Missing CEO skills: ${missing.join(', ')}`);
    }

    const strategySkillIds = [byName.get('ceo-model-router-optimizer')];
    const orchestrationSkillIds = [
      byName.get('ceo-memory-strategist'),
      byName.get('ceo-heartbeat-orchestrator'),
      byName.get('ceo-performance-analyzer'),
    ];
    const supervisionSkillIds = CEO_CORE_SKILL_NAMES.map((n) => byName.get(n));

    const [strategyMcp, orchestrationMcp, supervisionMcp] = await Promise.all([
      fetchMcpToolsForSkillIds(client, strategySkillIds),
      fetchMcpToolsForSkillIds(client, orchestrationSkillIds),
      fetchMcpToolsForSkillIds(client, supervisionSkillIds),
    ]);

    const ceoLayerConfig = {
      strategy: {
        temperature: 0.05,
        maxTokens: 512,
        systemPrompt: strategyPrompt,
        skillIds: strategySkillIds,
        mcpTools: strategyMcp,
      },
      orchestration: {
        temperature: 0.8,
        maxTokens: 4096,
        systemPrompt: orchestrationPrompt,
        skillIds: orchestrationSkillIds,
        mcpTools: orchestrationMcp,
      },
      supervision: {
        temperature: 0.2,
        maxTokens: 128000,
        systemPrompt: supervisionPrompt,
        skillIds: supervisionSkillIds,
        mcpTools: supervisionMcp,
      },
    };
    assertNoLegacyLayerKeys(ceoLayerConfig, 'script_output');

    const mergedMcpTools = unionMcpToolsByName([
      ceoLayerConfig.strategy,
      ceoLayerConfig.orchestration,
      ceoLayerConfig.supervision,
    ]);

    const mcpToolsCol = await client.query(
      `
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'marketplace_agents'
        and column_name = 'mcp_tools'
      limit 1
      `,
    );
    if ((mcpToolsCol.rowCount ?? 0) > 0) {
      await client.query(
        `update marketplace_agents set ceo_layer_config = $1::jsonb, mcp_tools = $2::jsonb, updated_at = current_timestamp where slug = 'ceo'`,
        [JSON.stringify(ceoLayerConfig), JSON.stringify(mergedMcpTools)],
      );
    } else {
      await client.query(
        `update marketplace_agents set ceo_layer_config = $1::jsonb, updated_at = current_timestamp where slug = 'ceo'`,
        [JSON.stringify(ceoLayerConfig)],
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          updated: 'ceo',
          mcpToolsPerLayer: {
            strategy: strategyMcp.length,
            orchestration: orchestrationMcp.length,
            supervision: supervisionMcp.length,
          },
          mcp_tools_union: mergedMcpTools.length,
          mcpToolsColumnPresent: (mcpToolsCol.rowCount ?? 0) > 0,
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
