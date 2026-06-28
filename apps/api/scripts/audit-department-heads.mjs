/**
 * 审计：平台部门绑定 vs 商城 department_head 列表。
 * Usage: node scripts/audit-department-heads.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const p of [join(__dirname, '../.env'), join(__dirname, '../../../.env')]) {
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/\r$/, '');
    }
    break;
  } catch {
    /* ignore */
  }
}

const client = new pg.Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'service_db',
});

await client.connect();
const bound = await client.query(`
  SELECT pd.slug AS dept_slug, pd.display_name, ma.slug AS director_slug, ma.name AS director_name
  FROM platform_departments pd
  LEFT JOIN marketplace_agents ma ON ma.id = pd.director_marketplace_agent_id
  ORDER BY pd.sort_order
`);
const unbound = await client.query(`
  SELECT ma.slug, ma.name, ma.is_published, ma.metadata->>'source' AS seed_source
  FROM marketplace_agents ma
  WHERE ma.agent_category = 'department_head'
    AND NOT EXISTS (
      SELECT 1 FROM platform_departments pd WHERE pd.director_marketplace_agent_id = ma.id
    )
  ORDER BY ma.slug
`);
const total = await client.query(
  `SELECT count(*)::int AS n FROM marketplace_agents WHERE agent_category = 'department_head'`,
);
console.log(JSON.stringify({ total_heads: total.rows[0].n, platform_bindings: bound.rows, unbound_heads: unbound.rows }, null, 2));
await client.end();
