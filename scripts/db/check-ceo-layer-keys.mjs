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

async function main() {
  await client.connect();

  const ceo = await client.query(`select id, name, slug from marketplace_agents where slug='ceo' limit 5;`);
  console.log('=== CEO marketplace_agents ===');
  console.table(ceo.rows);

  const ceoId = ceo.rows[0]?.id;
  if (!ceoId) {
    console.log('No CEO agent found.');
    await client.end();
    return;
  }

  const byLayer = await client.query(
    `
    select
      b.ceo_layer,
      count(*) as bound_keys,
      min(b.sort_order) as min_sort,
      max(b.sort_order) as max_sort,
      min(k.provider) as any_provider,
      min(k.model_name) as any_model
    from marketplace_agent_key_bindings b
    join llm_keys k on k.id = b.llm_key_id
    where b.marketplace_agent_id = $1
    group by b.ceo_layer
    order by b.ceo_layer;
  `,
    [ceoId],
  );
  console.log('=== CEO key bindings by layer (count only) ===');
  console.table(byLayer.rows);

  const firstPerLayer = await client.query(
    `
    select distinct on (b.ceo_layer)
      b.ceo_layer,
      b.sort_order,
      k.id as llm_key_id,
      k.key_alias,
      k.provider,
      k.model_name
    from marketplace_agent_key_bindings b
    join llm_keys k on k.id = b.llm_key_id
    where b.marketplace_agent_id = $1
    order by b.ceo_layer, b.sort_order asc;
  `,
    [ceoId],
  );
  console.log('=== CEO first key per layer (determines model lock) ===');
  console.table(firstPerLayer.rows);

  const unbound = await client.query(
    `
    select k.provider, k.model_name, count(*) as active_unbound
    from llm_keys k
    where k.is_active=true
      and not exists (select 1 from marketplace_agent_key_bindings b where b.llm_key_id=k.id)
    group by k.provider, k.model_name
    order by k.provider, k.model_name;
  `,
  );
  console.log('=== active unbound keys by provider/model ===');
  console.table(unbound.rows);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

