/**
 * 清空全局 LLM key 池及相关 Marketplace 绑定（不可逆）。
 *
 * 必须设置环境变量：CONFIRM_DELETE_ALL_LLM_KEYS=YES
 *
 *   CONFIRM_DELETE_ALL_LLM_KEYS=YES pnpm --filter @service/api run wipe:llm-keys
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFromFile() {
  const tryPaths = [
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../../.env.local'),
    resolve(__dirname, '../.env'),
    resolve(__dirname, '../.env.local'),
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

async function main() {
  loadEnvFromFile();
  if (process.env.CONFIRM_DELETE_ALL_LLM_KEYS !== 'YES') {
    console.error(
      'Refused: set CONFIRM_DELETE_ALL_LLM_KEYS=YES to delete all llm_keys and related marketplace bindings.',
    );
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM marketplace_agent_key_bindings`);
    await client.query(`DELETE FROM company_marketplace_agent_key_assignments`);
    await client.query(`UPDATE agents SET llm_key_id = NULL WHERE llm_key_id IS NOT NULL`);
    await client.query(
      `UPDATE billing_settings SET ceo_decision_llm_key_id = NULL WHERE ceo_decision_llm_key_id IS NOT NULL`,
    );
    const del = await client.query(`DELETE FROM llm_keys`);
    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, deletedLlmKeys: del.rowCount ?? 0 }, null, 2));
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
