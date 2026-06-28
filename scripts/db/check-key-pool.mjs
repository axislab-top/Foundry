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
    // Strip inline comments like: FOO=bar  # comment
    val = val.replace(/\s+#.*$/, '');
    // Strip surrounding quotes
    val = val.replace(/^"/, '').replace(/"$/, '').trim();
    out[key] = val;
  }
  return out;
}

const repoRoot = path.resolve(process.cwd());
const envPath = path.join(repoRoot, '.env.shared');
const env = fs.existsSync(envPath) ? parseEnvFile(envPath) : {};

// Resolve pg dependency from the migrations package (workspace dependency).
const migrationsPkgJson = path.join(repoRoot, 'infrastructure', 'migrations', 'package.json');
const requireFromMigrations = createRequire(migrationsPkgJson);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pg = requireFromMigrations('pg');

const host = (env.DB_HOST || env.POSTGRES_HOST || '127.0.0.1').split(' ')[0];
const port = Number(env.DB_PORT || env.POSTGRES_PORT || 5432);
const user = env.DB_USERNAME || env.POSTGRES_USER || 'postgres';
const password = env.DB_PASSWORD || env.POSTGRES_PASSWORD || 'postgres';
const database = env.DB_DATABASE || env.POSTGRES_DB || 'service_db';

const client = new pg.Client({ host, port, user, password, database });

async function main() {
  await client.connect();

  const totals = await client.query(`
    select
      (select count(*) from llm_keys) as total_keys,
      (select count(*) from llm_keys where is_active=true) as active_keys,
      (select count(*) from marketplace_agent_key_bindings) as total_bindings,
      (select count(distinct llm_key_id) from marketplace_agent_key_bindings) as bound_unique_keys,
      (select count(*) from llm_keys k where k.is_active=true and not exists (
        select 1 from marketplace_agent_key_bindings b where b.llm_key_id = k.id
      )) as active_unbound_keys;
  `);

  console.log('=== key pool totals (marketplace binding view) ===');
  console.log(totals.rows[0]);

  const byModel = await client.query(`
    select
      k.provider,
      k.model_name,
      count(*) filter (where k.is_active=true) as active_total,
      count(*) filter (where k.is_active=true and exists (
        select 1 from marketplace_agent_key_bindings b where b.llm_key_id = k.id
      )) as active_bound,
      count(*) filter (where k.is_active=true and not exists (
        select 1 from marketplace_agent_key_bindings b where b.llm_key_id = k.id
      )) as active_unbound
    from llm_keys k
    group by k.provider, k.model_name
    order by k.provider, k.model_name;
  `);

  console.log('=== by provider/model (active) ===');
  for (const row of byModel.rows) {
    console.log(
      `${row.provider}\t${row.model_name}\tactive=${row.active_total}\tbound=${row.active_bound}\tunbound=${row.active_unbound}`,
    );
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

