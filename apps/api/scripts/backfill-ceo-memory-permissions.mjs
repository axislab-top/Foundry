/**
 * Backfill memory permissions for CEO/system users.
 * Adds `memory:company:readwrite` to users.permissions JSON array.
 *
 * Usage:
 *   pnpm --filter @service/api run backfill:ceo-memory-permissions
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_PERMISSION = 'memory:company:readwrite';
const TARGET_ROLES = ['ceo', 'system'];

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

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    const users = await client.query(
      `
      select id, roles, permissions
      from users
      where exists (
        select 1
        from jsonb_array_elements_text(users.roles) as r(role)
        where lower(r.role) = any($1::text[])
      )
    `,
      [TARGET_ROLES],
    );

    let touched = 0;
    for (const u of users.rows) {
      const perms = Array.isArray(u.permissions) ? u.permissions.map((x) => String(x)) : [];
      if (perms.includes(TARGET_PERMISSION)) continue;
      const next = [...new Set([...perms, TARGET_PERMISSION])];
      await client.query(`update users set permissions = $2::jsonb where id = $1`, [
        u.id,
        JSON.stringify(next),
      ]);
      touched += 1;
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          scannedUsers: users.rows.length,
          touchedUsers: touched,
          grantedPermission: TARGET_PERMISSION,
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

