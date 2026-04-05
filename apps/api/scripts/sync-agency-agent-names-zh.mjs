/**
 * 将 marketplace 中 agency-agents 导入项的 name、description 同步为中文（来自 agency-agents-zh）。
 *
 * 准备：
 *   git clone --depth 1 https://github.com/jnMetaCode/agency-agents-zh.git vendor/agency-agents-zh
 *
 * 用法：
 *   pnpm --filter @service/api run sync:agency-names-zh
 *
 * 匹配规则（依次尝试）：
 *   1) 与上游 agency-agents 相同相对路径的文件
 *   2) 整个 zh 仓库内 basename 唯一时，按文件名匹配
 *
 * description：优先 frontmatter；无则摘取正文（引用块 / 首个 ## 标题 / 首段文字）。
 *
 * 环境变量：AGENCY_AGENTS_ZH_ROOT、DATABASE_URL / POSTGRES_*（同 import 脚本）
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SKIP_DIRS = new Set(['scripts', 'examples', 'integrations', 'node_modules', '.github', '.git']);
const SKIP_FILES = new Set(['readme.md', 'contributing.md', 'contributing_zh-cn.md', 'license', '.gitattributes', '.gitignore']);

function loadEnvFromFile() {
  const tryPaths = [join(__dirname, '../../../.env'), join(__dirname, '../../../.env.local'), join(__dirname, '../../.env')];
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

const UPSTREAM_ROOT = process.env.AGENCY_AGENTS_ROOT
  ? join(process.env.AGENCY_AGENTS_ROOT)
  : join(__dirname, '../../../vendor/agency-agents');
const ZH_ROOT = process.env.AGENCY_AGENTS_ZH_ROOT
  ? join(process.env.AGENCY_AGENTS_ZH_ROOT)
  : join(__dirname, '../../../vendor/agency-agents-zh');

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
  const user = process.env.POSTGRES_USER || process.env.DB_USERNAME || 'postgres';
  const pass = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || 'postgres';
  const db = process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

function slugFromRelPath(rel) {
  const noExt = rel.replace(/\.md$/i, '');
  return `agency-${noExt.replace(/[/\\]/g, '-')}`.slice(0, 120);
}

function* walkMarkdownFiles(dir, base = dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
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

/** 上游路径 -> 中文仓库路径（文件名/目录不一致时） */
const MANUAL_ZH_REL = {
  'marketing/marketing-bilibili-content-strategist.md': 'marketing/marketing-bilibili-strategist.md',
  'specialized/supply-chain-strategist.md': 'support/support-supply-chain-strategist.md',
};

function parseFrontmatterBlock(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return m ? m[1] : null;
}

function looseParseName(raw) {
  const fm = parseFrontmatterBlock(raw);
  if (!fm) return null;
  for (const line of fm.split(/\r?\n/)) {
    const mm = line.match(/^name:\s*(.*)$/);
    if (mm) return mm[1].trim() || null;
  }
  return null;
}

function looseParseDescription(raw) {
  const fm = parseFrontmatterBlock(raw);
  if (!fm) return null;
  for (const line of fm.split(/\r?\n/)) {
    const mm = line.match(/^description:\s*(.*)$/);
    if (mm) return mm[1].trim() || null;
  }
  return null;
}

/** frontmatter 无 name 时（如 strategy 文档），用正文第一行 # 标题 */
function fallbackTitleFromBody(raw) {
  const h = raw.match(/^#\s+(.+)$/m);
  if (!h) return null;
  return h[1].replace(/\*{2,}/g, '').trim().slice(0, 255);
}

function extractZhDisplayName(raw) {
  return looseParseName(raw) || fallbackTitleFromBody(raw);
}

/** 无 description 的文档：引用块 / 副标题 ## / 首个正文段落 */
function fallbackDescriptionFromBody(raw) {
  let body = raw;
  const fmEnd = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  if (fmEnd) body = fmEnd[1];

  const bq = body.match(/^>\s*(?:\*\*)?([^*\n]+?)(?:\*\*)?\s*$/m);
  if (bq) return bq[1].trim().slice(0, 4000);

  const sub = body.match(/^#[^\n]+\n+\#\#\s+(.+)$/m);
  if (sub) return sub[1].trim().slice(0, 4000);

  const h2 = body.match(/\n\#\#\s+([^\n]+)/);
  if (h2) return h2[1].trim().slice(0, 4000);

  const lines = body.split(/\r?\n/).map((l) => l.trim());
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('---')) continue;
    if (line.startsWith('```')) continue;
    if (line.startsWith('|')) continue;
    const cleaned = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim();
    if (cleaned.length >= 8) return cleaned.slice(0, 4000);
  }
  return null;
}

function extractZhDescription(raw) {
  return looseParseDescription(raw) || fallbackDescriptionFromBody(raw);
}

function buildBasenameIndex(zhRoot) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const { fullPath, rel } of walkMarkdownFiles(zhRoot)) {
    const b = basename(fullPath).toLowerCase();
    if (!map.has(b)) map.set(b, []);
    map.get(b).push(rel);
  }
  return map;
}

function resolveZhRel(upstreamRel, basenameIndex) {
  if (MANUAL_ZH_REL[upstreamRel]) {
    const manual = MANUAL_ZH_REL[upstreamRel];
    if (existsSync(join(ZH_ROOT, manual))) return manual;
  }

  const direct = join(ZH_ROOT, upstreamRel);
  if (existsSync(direct)) return upstreamRel;

  const b = basename(upstreamRel).toLowerCase();
  const list = basenameIndex.get(b);
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];

  const upDir = upstreamRel.split('/')[0];
  const sameTop = list.filter((r) => r.startsWith(upDir + '/'));
  if (sameTop.length === 1) return sameTop[0];

  return null;
}

async function main() {
  if (!existsSync(ZH_ROOT)) {
    console.error(`未找到中文仓库: ${ZH_ROOT}\n请: git clone https://github.com/jnMetaCode/agency-agents-zh.git vendor/agency-agents-zh`);
    process.exit(1);
  }

  const basenameIndex = buildBasenameIndex(ZH_ROOT);
  const updates = [];
  const skipped = [];

  for (const { rel } of walkMarkdownFiles(UPSTREAM_ROOT)) {
    const slug = slugFromRelPath(rel);
    const zhRel = resolveZhRel(rel, basenameIndex);
    if (!zhRel) {
      skipped.push(rel);
      continue;
    }
    const zhPath = join(ZH_ROOT, zhRel);
    const raw = readFileSync(zhPath, 'utf8');
    const zhName = extractZhDisplayName(raw);
    if (!zhName) {
      skipped.push(`${rel} (无法解析标题)`);
      continue;
    }
    const zhDesc = extractZhDescription(raw);
    updates.push({ slug, name: zhName, description: zhDesc ?? null });
  }

  console.log(`可更新 name/description: ${updates.length} 条；未匹配或缺标题: ${skipped.length} 条`);

  if (skipped.length && skipped.length <= 30) {
    console.log('未更新项:', skipped.join(', '));
  } else if (skipped.length) {
    console.log('未更新项示例（前 20）:', skipped.slice(0, 20).join(', '));
  }

  if (DRY) {
    console.log('DRY_RUN=1，未写数据库');
    process.exit(0);
  }

  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  let n = 0;
  try {
    for (const { slug, name, description } of updates) {
      const r = await client.query(
        `UPDATE marketplace_agents SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE slug = $3 AND metadata->>'source' = 'agency-agents'`,
        [name, description, slug],
      );
      n += r.rowCount ?? 0;
    }
  } finally {
    await client.end();
  }

  console.log(`完成：已更新 ${n} 行（仅 slug 前缀 agency- 且 metadata.source=agency-agents）。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
