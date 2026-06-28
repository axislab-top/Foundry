import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../migrations/package.json', import.meta.url),
);
const pg = require('pg');

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../seeds/platform_departments_capabilities_17.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'service_db',
});

await client.connect();
await client.query(sql);

const total = await client.query('SELECT count(*)::int AS n FROM platform_departments');
const filled = await client.query(
  `SELECT count(*)::int AS n FROM platform_departments
   WHERE responsibility_summary IS NOT NULL AND length(trim(responsibility_summary)) >= 8`,
);
const yours = await client.query(
  `SELECT slug, display_name, sort_order,
          left(responsibility_summary, 48) AS summary_preview,
          task_type_tags
   FROM platform_departments
   WHERE slug IN (
     'engineering','design','marketing','paid-media','sales','finance','hr','legal',
     'supply-chain','product','project-management','qa','support','special-projects',
     'spatial-computing','game-development','strategy'
   )
   ORDER BY sort_order`,
);

console.log('platform_departments total:', total.rows[0].n);
console.log('with responsibility_summary (>=8 chars):', filled.rows[0].n);
console.log('your 17 slugs filled:', yours.rows.length);
for (const row of yours.rows) {
  console.log(`  ${row.sort_order}\t${row.slug}\t${row.display_name}\t${(row.task_type_tags || []).length} tags`);
}
await client.end();
