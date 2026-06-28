#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadEnvFile(p) {
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(repoRoot, 'infrastructure', 'postgres', '.env'));
loadEnvFile(path.join(repoRoot, 'apps', 'api', '.env'));

const host = process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost';
const port = String(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432');
const user = process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres';
const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres';
const database = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';

const migrationName = process.env.BASELINE_MIGRATION_NAME || 'BaselineSchema';
const timestamp = process.env.BASELINE_TS || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const className = `${migrationName}${timestamp}`;
const fileName = `${timestamp}_${migrationName}.ts`;
const outDir = path.join(repoRoot, 'infrastructure', 'postgres', 'migrations-baseline');
const sqlPath = path.join(outDir, `${timestamp}_${migrationName}.sql`);
const tsPath = path.join(outDir, fileName);

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const env = { ...process.env, PGPASSWORD: password };
const dumpCmd =
  `pg_dump --schema-only --no-owner --no-privileges ` +
  `--host "${host}" --port "${port}" --username "${user}" --dbname "${database}"`;

let schemaSql = '';
try {
  schemaSql = execSync(dumpCmd, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
  console.error('[baseline] failed to run pg_dump. Ensure pg_dump is installed and DB is reachable.');
  if (error?.stderr) console.error(String(error.stderr));
  process.exit(1);
}

const cleanedSql = schemaSql
  .replace(/\r\n/g, '\n')
  .replace(/^--.*$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

writeFileSync(sqlPath, `${cleanedSql}\n`, 'utf8');

const migrationTs = `import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlPath = path.join(__dirname, '${path.basename(sqlPath)}');
    const sql = readFileSync(sqlPath, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // baseline down is intentionally unsupported
  }
}
`;

writeFileSync(tsPath, migrationTs, 'utf8');
console.log(`[baseline] generated: ${tsPath}`);
console.log(`[baseline] schema dump: ${sqlPath}`);

