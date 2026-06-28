import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Real baseline generated from live Docker PostgreSQL schema dump.
 *
 * Source SQL file:
 * - migrations-baseline/baseline-schema.sql
 */
export class BaselineSchemaFromDump20260426010000 implements MigrationInterface {
  name = 'BaselineSchemaFromDump20260426010000';

  private readSqlFileNormalized(sqlPath: string): string {
    const raw = readFileSync(sqlPath);
    // PowerShell redirection commonly writes UTF-16LE with BOM on Windows.
    if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
      return raw.subarray(2).toString('utf16le');
    }
    if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
      return raw.subarray(2).toString('utf16le');
    }
    // UTF-8 BOM
    if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
      return raw.subarray(3).toString('utf8');
    }
    return raw.toString('utf8');
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // If core tables already exist, this is not a fresh database.
    // In that case baseline should be treated as a no-op.
    const existing = await queryRunner.query(
      `SELECT to_regclass('public.companies') AS companies, to_regclass('public.users') AS users`,
    );
    const row = (existing?.[0] ?? {}) as { companies?: string | null; users?: string | null };
    if (row.companies || row.users) {
      return;
    }

    const sqlPath = path.join(__dirname, 'baseline-schema.sql');
    const normalized = this.readSqlFileNormalized(sqlPath);
    const sql = normalized
      .split(/\r?\n/)
      // pg_dump plain-text output may include psql meta commands (\restrict / \unrestrict),
      // which are not valid SQL for the driver protocol used by TypeORM.
      .filter((line) => !line.trimStart().startsWith('\\'))
      // Baseline bootstrap does not depend on SQL comments. Dropping COMMENT ON lines
      // avoids encoding-related parse failures in mixed-charset dumps.
      .filter((line) => !/^\s*COMMENT\s+ON\s+/i.test(line))
      // Keep default search_path for TypeORM bookkeeping queries after migration.
      .filter((line) => !/set_config\('search_path'/i.test(line))
      .join('\n')
      // TypeORM manages its own migrations table; baseline dump may include it.
      .replace(/CREATE SEQUENCE public\.migrations_id_seq[\s\S]*?;\s*/gi, '')
      .replace(/ALTER SEQUENCE public\.migrations_id_seq[\s\S]*?;\s*/gi, '')
      .replace(/CREATE TABLE public\.migrations\s*\([\s\S]*?\);\s*/gi, '')
      .replace(/ALTER TABLE ONLY public\.migrations[\s\S]*?;\s*/gi, '')
      .replace(/CREATE(?: UNIQUE)? INDEX [^\n]* ON public\.migrations[^\n]*;\s*/gi, '');
    await queryRunner.query(sql);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Baseline down is intentionally unsupported.
  }
}

