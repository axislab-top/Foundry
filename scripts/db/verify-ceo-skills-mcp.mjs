/**
 * 验证 CEO 商城模板：mcp_tools、ceo_layer_config 各层 skillIds、recommended_skills；
 * 抽样公司实例：role=ceo 的 agent_skills 绑定数量。
 *
 * 用法（仓库根目录）: node scripts/db/verify-ceo-skills-mcp.mjs
 */
import fs from 'fs';
import path from 'path';
import process from 'process';
import { createRequire } from 'module';

function parseEnvFile(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? '';
    val = val.replace(/\s+#.*$/, '');
    val = val.replace(/^"/, '').replace(/"$/, '').trim();
    out[key] = val;
  }
  return out;
}

const repoRoot = path.resolve(process.cwd());
const envPath = path.join(repoRoot, '.env.shared');
const env = fs.existsSync(envPath) ? parseEnvFile(envPath) : {};

const migrationsPkgJson = path.join(repoRoot, 'infrastructure', 'migrations', 'package.json');
const requireFromMigrations = createRequire(migrationsPkgJson);
const pg = requireFromMigrations('pg');

const host = (env.DB_HOST || env.POSTGRES_HOST || '127.0.0.1').split(' ')[0];
const port = Number(env.DB_PORT || env.POSTGRES_PORT || 5432);
const user = env.DB_USERNAME || env.POSTGRES_USER || 'postgres';
const password = env.DB_PASSWORD || env.POSTGRES_PASSWORD || 'postgres';
const database = env.DB_DATABASE || env.POSTGRES_DB || 'service_db';

const client = new pg.Client({ host, port, user, password, database });

function summarizeLayer(cfg, layer) {
  const L = cfg?.[layer];
  if (!L || typeof L !== 'object') return { layer, missing: true };
  const ids = Array.isArray(L.skillIds) ? L.skillIds : [];
  return {
    layer,
    skillIdCount: ids.length,
    temperature: L.temperature,
    maxTokens: L.maxTokens,
    hasSystemPrompt: typeof L.systemPrompt === 'string' && L.systemPrompt.length > 0,
  };
}

async function main() {
  await client.connect();

  const ma = await client.query(
    `
    select
      id,
      slug,
      name,
      mcp_tools,
      ceo_layer_config,
      recommended_skills,
      recommended_skill_version_ids
    from marketplace_agents
    where slug = 'ceo'
    limit 1
  `,
  );

  const row = ma.rows[0];
  if (!row) {
    console.log('FAIL: no marketplace_agents row with slug=ceo');
    await client.end();
    process.exit(1);
  }

  const mcp = Array.isArray(row.mcp_tools) ? row.mcp_tools : [];
  const rec = Array.isArray(row.recommended_skills) ? row.recommended_skills : [];
  const recVer = Array.isArray(row.recommended_skill_version_ids) ? row.recommended_skill_version_ids : [];
  const cfg = row.ceo_layer_config && typeof row.ceo_layer_config === 'object' ? row.ceo_layer_config : {};

  console.log('=== CEO 商城模板 (marketplace_agents.slug=ceo) ===');
  console.log(`  id: ${row.id}`);
  console.log(`  mcp_tools 条数: ${mcp.length}`);
  if (mcp.length) {
    console.log(
      '  mcp 工具名:',
      mcp.map((t) => (t && typeof t === 'object' ? t.name : '?')).join(', '),
    );
  }

  console.log(`  recommended_skills (name 列表) 条数: ${rec.length}`);
  console.log(`  recommended_skill_version_ids 条数: ${recVer.length}`);

  for (const layer of ['classifier', 'light', 'heavy']) {
    console.log(`  ${layer}:`, JSON.stringify(summarizeLayer(cfg, layer)));
  }

  const allSkillIds = new Set();
  for (const layer of ['classifier', 'light', 'heavy']) {
    const L = cfg[layer];
    if (L && Array.isArray(L.skillIds)) {
      for (const id of L.skillIds) {
        if (id) allSkillIds.add(String(id));
      }
    }
  }

  if (allSkillIds.size > 0) {
    const ids = [...allSkillIds];
    const res = await client.query(
      `select id, name, company_id from skills where id = any($1::uuid[])`,
      [ids],
    );
    const found = new Map(res.rows.map((r) => [r.id, r]));
    const missing = ids.filter((id) => !found.has(id));
    console.log('=== ceo_layer_config 引用的 skills 行 ===');
    console.log(`  解析到 ${res.rows.length}/${ids.length} 条（company_id 为 null 表示全局 skill）`);
    if (missing.length) {
      console.log('  WARN: 下列 UUID 在 skills 表中不存在:', missing.join(', '));
    }
    for (const r of res.rows) {
      console.log(`    - ${r.name} (${r.id}) company_id=${r.company_id ?? 'null'}`);
    }
  } else {
    console.log('=== ceo_layer_config 中无 skillIds ===');
  }

  const inst = await client.query(
    `
    select
      a.id as agent_id,
      a.company_id,
      a.name,
      count(asb.skill_id)::int as bound_skills
    from agents a
    left join agent_skills asb on asb.agent_id = a.id and asb.company_id = a.company_id
    where a.role = 'ceo'
    group by a.id, a.company_id, a.name
    order by a.created_at desc
    limit 8
  `,
  );

  console.log('=== 实例 CEO Agent（最多 8 个）agent_skills 绑定数 ===');
  console.table(inst.rows);

  const okMcp = mcp.length > 0;
  const okLayers = ['classifier', 'light', 'heavy'].every((layer) => {
    const L = cfg[layer];
    return L && Array.isArray(L.skillIds) && L.skillIds.length > 0;
  });

  let mcpRows = [];
  let bindRows = [];
  try {
    const mt = await client.query(
      `select id, name, company_id, is_enabled from mcp_tools order by name asc limit 30`,
    );
    mcpRows = mt.rows;
    console.log(`=== mcp_tools 表（最多 30 行，全局+租户）共存在 ${mcpRows.length} 条展示 ===`);
    console.table(mcpRows);
  } catch (e) {
    console.log('=== mcp_tools 表 ===', e instanceof Error ? e.message : e);
  }

  if (allSkillIds.size > 0) {
    try {
      const ids = [...allSkillIds];
      const b = await client.query(
        `
        select smb.skill_id, s.name as skill_name, smb.mcp_tool_id, mt.name as tool_name
        from skill_mcp_tool_bindings smb
        join skills s on s.id = smb.skill_id
        join mcp_tools mt on mt.id = smb.mcp_tool_id
        where smb.skill_id = any($1::uuid[])
        order by s.name, mt.name
      `,
        [ids],
      );
      bindRows = b.rows;
      console.log('=== CEO 三层 skillIds 对应的 skill ↔ MCP 绑定（skill_mcp_tool_bindings）===');
      console.log(`  行数: ${bindRows.length}`);
      if (bindRows.length) console.table(bindRows);
      else console.log('  （无绑定：MCP 能力可能仅来自商城 mcp_tools JSON 或运行时注册）');
    } catch (e2) {
      console.log('=== skill_mcp_tool_bindings ===', e2 instanceof Error ? e2.message : e2);
    }
  }

  console.log('=== 摘要 ===');
  console.log(`  商城模板 JSON mcp_tools: ${okMcp ? '非空' : '空（需在管理端保存或写库）'}`);
  console.log(`  三层均有 skillIds: ${okLayers ? '是' : '否'}`);
  if (!okLayers) {
    process.exitCode = 1;
  }
  if (!okMcp && bindRows.length === 0 && mcpRows.length === 0) {
    console.log('  提示: 未发现商城 mcp_tools、skill↔MCP 绑定、或 mcp_tools 表数据 — 请确认管理端已保存并同步到本库。');
    process.exitCode = 1;
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
