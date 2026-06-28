/**
 * 清理历史 seed-department-heads 遗留的「未绑定平台部门」总监模板。
 * 当前仓库约定仅保留已 seed 的总监 slug（可按 KEEP_SLUGS 调整）。
 *
 * Usage:
 *   node scripts/prune-orphan-department-heads.mjs          # 执行删除
 *   DRY_RUN=1 node scripts/prune-orphan-department-heads.mjs  # 仅预览
 *
 * 不会删除：platform_departments 已绑定的总监；KEEP_SLUGS 中的 slug。
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const KEEP_SLUGS = new Set([
  'director-engineering-v1',
  'director-design-v1',
  'director-marketing-v1',
  'director-paid-media-v1',
  'director-sales-v1',
  'director-finance-v1',
  'director-hr-v1',
  'director-legal-v1',
  'director-supply-chain-v1',
  'director-product-v1',
  'director-project-management-v1',
  'director-qa-v1',
  'director-support-v1',
  'director-special-projects-v1',
  'director-spatial-computing-v1',
  'director-research-intelligence-v1',
]);

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function loadEnv() {
  for (const p of [join(__dirname, '../.env'), join(__dirname, '../../../.env')]) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && process.env[m[1]] === undefined) {
          let v = m[2].replace(/\r$/, '');
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          process.env[m[1]] = v;
        }
      }
      break;
    } catch {
      /* ignore */
    }
  }
}

loadEnv();

const client = new pg.Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'service_db',
});

await client.connect();

const candidates = await client.query(
  `
    SELECT ma.id, ma.slug, ma.name
    FROM marketplace_agents ma
    WHERE ma.agent_category = 'department_head'
      AND ma.slug <> ALL($1::text[])
      AND NOT EXISTS (
        SELECT 1 FROM platform_departments pd WHERE pd.director_marketplace_agent_id = ma.id
      )
    ORDER BY ma.slug
  `,
  [[...KEEP_SLUGS]],
);

const results = { dryRun: DRY_RUN, kept: [...KEEP_SLUGS], deleted: [], skipped: [] };

for (const row of candidates.rows) {
  const subs = await client.query(
    `SELECT count(*)::int AS n FROM marketplace_agent_subscriptions WHERE marketplace_agent_id = $1`,
    [row.id],
  );
  const hires = await client.query(
    `SELECT count(*)::int AS n FROM marketplace_hire_requests WHERE marketplace_agent_id = $1`,
    [row.id],
  );
  const subN = subs.rows[0]?.n ?? 0;
  const hireN = hires.rows[0]?.n ?? 0;
  if (subN > 0 || hireN > 0) {
    results.skipped.push({
      slug: row.slug,
      reason: `has subscriptions=${subN} hire_requests=${hireN}`,
    });
    continue;
  }
  if (!DRY_RUN) {
    await client.query(`DELETE FROM marketplace_agent_key_bindings WHERE marketplace_agent_id = $1`, [row.id]);
    await client.query(`DELETE FROM marketplace_agents WHERE id = $1`, [row.id]);
  }
  results.deleted.push({ slug: row.slug, name: row.name });
}

console.log(JSON.stringify(results, null, 2));
await client.end();
