/**
 * Productize CEO facts/memory capabilities:
 * 1) Upsert global tools (tools table)
 * 2) Bind tools to existing global skills (skill_tool_bindings)
 * 3) Update company_ceo_layer_configs.orchestration.skillIds for all companies
 *
 * Usage:
 *   pnpm --filter @service/api exec node scripts/seed-ceo-facts-memory-tools-and-bindings.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  const tryPaths = [join(__dirname, '../../../.env'), join(__dirname, '../../../.env.local'), join(__dirname, '../../.env')];
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

function toCanonicalLayerConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  delete src.classifier;
  delete src.light;
  delete src.heavy;
  for (const layer of ['strategy', 'orchestration', 'supervision']) {
    const v = src[layer];
    if (!v || typeof v !== 'object' || Array.isArray(v)) src[layer] = {};
  }
  return src;
}

const ITEMS = [
  {
    skillName: 'memory.search',
    toolName: 'ceo_memory_search',
    displayName: 'CEO Memory Search Tool',
    description: 'Query company memory for historical decisions and context.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 300 },
        topK: { type: 'integer', minimum: 1, maximum: 12 },
        namespacesHint: { type: 'array', items: { type: 'string' }, maxItems: 12 },
      },
      required: ['query'],
    },
  },
  {
    skillName: 'facts.company.query',
    toolName: 'ceo_company_facts_query',
    displayName: 'CEO Company Facts Query Tool',
    description: 'Query real-time company/group facts: roster, members, role presence, org structure.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        queryType: { type: 'string', enum: ['company_people', 'room_members', 'role_presence', 'org_structure'] },
        roleQuery: { type: 'string', maxLength: 120 },
        ask: { type: 'string', maxLength: 300 },
      },
      required: ['queryType'],
    },
  },
  {
    skillName: 'department.knowledge.query',
    toolName: 'ceo_department_knowledge_query',
    displayName: 'CEO Department Knowledge Query Tool',
    description: 'Query department-specific knowledge context from memory.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        department: { type: 'string', minLength: 1, maxLength: 80 },
        query: { type: 'string', minLength: 2, maxLength: 300 },
        topK: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['department', 'query'],
    },
  },
];

async function upsertTool(client, item) {
  const exists = await client.query(`select id from tools where company_id is null and name = $1 limit 1`, [item.toolName]);
  if (exists.rowCount === 0) {
    const ins = await client.query(
      `
      insert into tools (
        id, company_id, name, display_name, description,
        implementation_type, handler_config, input_schema, output_schema,
        security_profile, required_permissions, is_enabled,
        version, semver_version, approval_status, approval_request_id, change_reason
      ) values (
        gen_random_uuid(), null, $1, $2, $3,
        'builtin', '{}'::jsonb, $4::jsonb, null,
        'safe', '[]'::jsonb, true,
        1, '1.0.0', 'none', null, 'seed ceo facts-memory tools'
      ) returning id
      `,
      [item.toolName, item.displayName, item.description, JSON.stringify(item.inputSchema)],
    );
    return ins.rows[0].id;
  }
  const id = exists.rows[0].id;
  await client.query(
    `
    update tools
    set display_name = $2,
        description = $3,
        implementation_type = 'builtin',
        handler_config = '{}'::jsonb,
        input_schema = $4::jsonb,
        output_schema = null,
        security_profile = 'safe',
        required_permissions = '[]'::jsonb,
        is_enabled = true,
        approval_status = 'none',
        approval_request_id = null,
        change_reason = 'seed ceo facts-memory tools',
        version = version + 1,
        updated_at = current_timestamp
    where id = $1
    `,
    [id, item.displayName, item.description, JSON.stringify(item.inputSchema)],
  );
  return id;
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    const skills = await client.query(
      `select id, name from skills where company_id is null and name = any($1::text[])`,
      [ITEMS.map((x) => x.skillName)],
    );
    const skillByName = new Map(skills.rows.map((r) => [r.name, r.id]));
    const missing = ITEMS.map((x) => x.skillName).filter((n) => !skillByName.has(n));
    if (missing.length) throw new Error(`Missing global skills: ${missing.join(', ')}`);

    const toolRows = [];
    const skillIdsForLayer = [];
    for (const item of ITEMS) {
      const toolId = await upsertTool(client, item);
      const skillId = skillByName.get(item.skillName);
      skillIdsForLayer.push(skillId);
      toolRows.push({ name: item.toolName, id: toolId, skillName: item.skillName, skillId });
      await client.query(
        `
        insert into skill_tool_bindings (id, company_id, skill_id, tool_id, position, is_overridden, config_override, created_by)
        values (gen_random_uuid(), null, $1, $2, 0, false, null, null)
        on conflict (skill_id, tool_id) do update set position = excluded.position
        `,
        [skillId, toolId],
      );
    }

    // Patch marketplace CEO template (admin UI reads marketplace_agents.ceo_layer_config).
    // Keep it in sync with the company snapshot defaults: 3 layers -> union skillIds.
    const tpl = await client.query(
      `
      select id, ceo_layer_config
      from marketplace_agents
      where slug = 'ceo'
      order by is_published desc, updated_at desc
      limit 1
      `,
    );
    let marketplaceTemplateUpdated = false;
    if (tpl.rowCount > 0) {
      const tplId = tpl.rows[0].id;
      const currentCfg = (tpl.rows[0].ceo_layer_config ?? {}) || {};
      const cfg = toCanonicalLayerConfig(currentCfg);
      const layers = ['strategy', 'orchestration', 'supervision'];
      for (const layer of layers) {
        const layerCfg =
          cfg[layer] && typeof cfg[layer] === 'object' && !Array.isArray(cfg[layer]) ? { ...cfg[layer] } : {};
        const existingSkillIds = Array.isArray(layerCfg.skillIds)
          ? layerCfg.skillIds.map((x) => String(x ?? '').trim()).filter(Boolean)
          : [];
        layerCfg.skillIds = [...new Set([...existingSkillIds, ...skillIdsForLayer])];
        cfg[layer] = layerCfg;
      }
      await client.query(
        `
        update marketplace_agents
        set ceo_layer_config = $2::jsonb, updated_at = current_timestamp
        where id = $1
        `,
        [tplId, JSON.stringify(cfg)],
      );
      marketplaceTemplateUpdated = true;
    }

    const companies = await client.query(`select id from companies`);
    const layers = ['strategy', 'orchestration', 'supervision'];
    for (const row of companies.rows) {
      await client.query(
        `
        insert into company_ceo_layer_configs (id, company_id, ceo_layer_config)
        values (gen_random_uuid(), $1, '{}'::jsonb)
        on conflict (company_id) do nothing
        `,
        [row.id],
      );
      const cfgRes = await client.query(
        `select ceo_layer_config from company_ceo_layer_configs where company_id = $1 limit 1`,
        [row.id],
      );
      const cfg = toCanonicalLayerConfig((cfgRes.rows[0]?.ceo_layer_config ?? {}) || {});
      for (const layer of layers) {
        const layerCfg =
          cfg[layer] && typeof cfg[layer] === 'object' && !Array.isArray(cfg[layer]) ? { ...cfg[layer] } : {};
        const existingSkillIds = Array.isArray(layerCfg.skillIds)
          ? layerCfg.skillIds.map((x) => String(x ?? '').trim()).filter(Boolean)
          : [];
        layerCfg.skillIds = [...new Set([...existingSkillIds, ...skillIdsForLayer])];
        cfg[layer] = layerCfg;
      }
      await client.query(
        `
        update company_ceo_layer_configs
        set ceo_layer_config = $2::jsonb, updated_at = current_timestamp
        where company_id = $1
        `,
        [row.id, JSON.stringify(cfg)],
      );
    }
    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          ok: true,
          tools: toolRows,
          skillIdsAddedToOrchestration: skillIdsForLayer,
          marketplaceCeoTemplateUpdated: marketplaceTemplateUpdated,
          companiesUpdated: companies.rowCount,
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
