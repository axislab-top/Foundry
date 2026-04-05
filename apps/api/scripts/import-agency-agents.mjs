/**
 * 将 https://github.com/msitarzewski/agency-agents 克隆到本地后，导入为 marketplace_agents 商品。
 *
 * 准备：
 *   git clone https://github.com/msitarzewski/agency-agents.git vendor/agency-agents
 *   （或任意路径，用 AGENCY_AGENTS_ROOT 指定）
 *
 * 用法（在仓库根目录）：
 *   pnpm --filter @service/api run import:agency-agents
 *
 * 环境变量：
 *   AGENCY_AGENTS_ROOT  默认仓库根下 vendor/agency-agents
 *   DRY_RUN=1           只扫描并打印数量，不写库
 *   PUBLISH=0           导入为草稿（is_published=false），默认 1 为上架
 *   DATABASE_URL        若未设置，则用 POSTGRES_* 拼连接串（与 .env.shared 一致）
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** agency-agents 部分 description 含冒号，严格 YAML 会失败，失败时退回逐行解析 */
function looseParseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { data: {}, content: raw.trim() };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^(name|description|color|emoji|vibe):\s*(.*)$/);
    if (mm) data[mm[1]] = mm[2];
  }
  return { data, content: m[2].trim() };
}

function parseAgentMarkdown(raw) {
  try {
    const parsed = matter(raw);
    return { data: parsed.data || {}, content: (parsed.content || '').trim() };
  } catch {
    return looseParseFrontmatter(raw);
  }
}

const SKIP_DIRS = new Set(['scripts', 'examples', 'integrations', 'node_modules', '.github', '.git']);
const SKIP_FILES = new Set(['readme.md', 'contributing.md', 'contributing_zh-cn.md', 'license', '.gitattributes', '.gitignore']);

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
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[k] === undefined) process.env[k] = v;
      }
      break;
    } catch {
      /* continue */
    }
  }
}

loadEnvFromFile();

const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const PUBLISH = process.env.PUBLISH !== '0' && process.env.PUBLISH !== 'false';

const DEFAULT_ROOT = join(__dirname, '../../../vendor/agency-agents');
const AGENCY_ROOT = process.env.AGENCY_AGENTS_ROOT
  ? join(process.env.AGENCY_AGENTS_ROOT)
  : DEFAULT_ROOT;

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
  const user = process.env.POSTGRES_USER || process.env.DB_USERNAME || 'postgres';
  const pass = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || 'postgres';
  const db = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

function* walkMarkdownFiles(dir, base = dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new Error(`无法读取目录 ${dir}: ${e?.message || e}`);
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      yield* walkMarkdownFiles(p, base);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
      const bn = ent.name.toLowerCase();
      if (SKIP_FILES.has(bn)) continue;
      yield { fullPath: p, rel: relative(base, p).replace(/\\/g, '/') };
    }
  }
}

function slugFromRelPath(rel) {
  const noExt = rel.replace(/\.md$/i, '');
  const slug = `agency-${noExt.replace(/[/\\]/g, '-')}`;
  return slug.slice(0, 120);
}

function firstHeading(markdown) {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

async function main() {
  let stat;
  try {
    stat = statSync(AGENCY_ROOT);
  } catch {
    console.error(
      `未找到 agency-agents 目录: ${AGENCY_ROOT}\n` +
        `请先: git clone https://github.com/msitarzewski/agency-agents.git vendor/agency-agents\n` +
        `或设置 AGENCY_AGENTS_ROOT`,
    );
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    console.error(`不是目录: ${AGENCY_ROOT}`);
    process.exit(1);
  }

  const rows = [];
  for (const { fullPath, rel } of walkMarkdownFiles(AGENCY_ROOT)) {
    const raw = readFileSync(fullPath, 'utf8');
    const parsed = parseAgentMarkdown(raw);
    const body = parsed.content;
    const data = parsed.data || {};

    const name =
      (typeof data.name === 'string' && data.name.trim()) ||
      firstHeading(body) ||
      basename(fullPath, '.md');

    const description = typeof data.description === 'string' ? data.description.trim() : null;
    const expertise =
      (typeof data.vibe === 'string' && data.vibe.trim()) ||
      (description ? description.slice(0, 500) : null);

    const division = rel.split('/')[0] || 'root';

    const metadata = {
      source: 'agency-agents',
      sourceRepo: 'https://github.com/msitarzewski/agency-agents',
      license: 'MIT',
      division,
      relativePath: rel,
      color: data.color ?? null,
      emoji: data.emoji ?? null,
      vibe: data.vibe ?? null,
    };

    rows.push({
      slug: slugFromRelPath(rel),
      name: name.slice(0, 255),
      description,
      expertise,
      system_prompt: body || null,
      metadata,
      is_published: PUBLISH,
    });
  }

  console.log(`扫描 ${AGENCY_ROOT}：共 ${rows.length} 个 agent .md`);

  if (DRY) {
    console.log('DRY_RUN=1，未写入数据库。');
    process.exit(0);
  }

  const databaseUrl = resolveDatabaseUrl();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const r of rows) {
      const metaJson = JSON.stringify(r.metadata);
      await client.query(
        `
        INSERT INTO marketplace_agents (
          slug, name, description, expertise, system_prompt,
          pricing_model, price_cents, is_published, recommended_skills, metadata
        )
        VALUES ($1, $2, $3, $4, $5, 'free', 0, $6, '[]'::jsonb, $7::jsonb)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          expertise = EXCLUDED.expertise,
          system_prompt = EXCLUDED.system_prompt,
          is_published = EXCLUDED.is_published,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP
      `,
        [r.slug, r.name, r.description, r.expertise, r.system_prompt, r.is_published, metaJson],
      );
    }
  } finally {
    await client.end();
  }

  console.log(`完成：已对 ${rows.length} 条记录执行 upsert（slug 前缀 agency-，可重复执行同步）。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
