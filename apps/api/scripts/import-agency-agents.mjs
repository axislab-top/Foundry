/**
 * 将 agency-agents 的 .md 角色导入为 Foundry marketplace_agents（工程部员工等）。
 *
 * 默认扫描顺序：docs/agency-agents → vendor/agency-agents
 *
 * 用法：
 *   pnpm --filter @service/api run import:agency-agents
 *   pnpm --filter @service/api run seed:engineering-agency-employees
 *
 * 环境变量：
 *   AGENCY_AGENTS_ROOT      源目录（默认 docs/agency-agents 或 vendor/agency-agents）
 *   AGENCY_AGENTS_DIVISION  仅导入某分部，如 engineering（匹配相对路径前缀）
 *   DRY_RUN=1               只扫描，不写库
 *   PUBLISH=0               草稿；默认上架
 *   DATABASE_URL / POSTGRES_*
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_EXECUTOR_SKILLS = [
  'echo',
  'code-run',
  'file-read',
  'file-write',
  'github-create-issue',
  'employee-task-reporter',
];

/** agency-agents 顶层目录 → Foundry department_roles */
const DIVISION_TO_DEPARTMENT_ROLES = {
  engineering: ['engineering', 'tech'],
  design: ['design'],
  marketing: ['marketing'],
  'paid-media': ['paid_media', 'paid-media'],
  sales: ['sales'],
  product: ['product'],
  testing: ['qa'],
  support: ['support'],
  hr: ['hr'],
  legal: ['legal'],
  finance: ['finance'],
  'spatial-computing': ['spatial_computing', 'spatial-computing'],
  'game-development': ['game_development', 'game-development'],
  'project-management': ['project_management', 'project-management'],
  specialized: ['special_projects', 'special-projects'],
  strategy: ['special_projects', 'strategy'],
};

/** 按文件名追加岗位向 Skill（须已在 Global Skills 中存在） */
const EXTRA_SKILLS_BY_BASENAME = {
  'engineering-wechat-mini-program-developer': [
    'wechat-miniprogram-scaffold',
    'wechat-miniprogram-page-builder',
  ],
  'engineering-backend-architect': ['engineering-api-integration'],
  'engineering-data-engineer': ['engineering-api-integration'],
  'engineering-feishu-integration-developer': ['engineering-api-integration'],
  'engineering-voice-ai-integration-engineer': ['engineering-api-integration'],
  'engineering-email-intelligence-engineer': ['engineering-api-integration'],
  'engineering-database-optimizer': ['engineering-api-integration'],
  'engineering-rapid-prototyper': ['engineering-fullstack-implementer'],
  'engineering-frontend-developer': ['engineering-fullstack-implementer'],
  'engineering-senior-developer': ['engineering-fullstack-implementer'],
  'engineering-mobile-app-builder': ['engineering-fullstack-implementer'],
  'engineering-ai-engineer': ['engineering-fullstack-implementer'],
  'engineering-code-reviewer': ['code-review-assistant', 'engineering-fullstack-implementer'],
};

const DEFAULT_ENGINEERING_EXTRA = ['engineering-fullstack-implementer'];

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

const SKIP_DIRS = new Set(['scripts', 'examples', 'integrations', 'node_modules', '.github', '.git', 'runbooks', 'playbooks', 'coordination']);
const SKIP_FILES = new Set([
  'readme.md',
  'contributing.md',
  'contributing_zh-cn.md',
  'license',
  '.gitattributes',
  '.gitignore',
  'quickstart.md',
  'executive-brief.md',
  'nexus-strategy.md',
  'security.md',
]);

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
      /* continue */
    }
  }
}

function resolveAgencyRoot() {
  if (process.env.AGENCY_AGENTS_ROOT) {
    return join(process.env.AGENCY_AGENTS_ROOT);
  }
  const docsRoot = join(__dirname, '../../../docs/agency-agents');
  const vendorRoot = join(__dirname, '../../../vendor/agency-agents');
  if (existsSync(docsRoot) && statSync(docsRoot).isDirectory()) return docsRoot;
  return vendorRoot;
}

loadEnvFromFile();

const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const PUBLISH = process.env.PUBLISH !== '0' && process.env.PUBLISH !== 'false';
const DIVISION_FILTER = process.env.AGENCY_AGENTS_DIVISION?.trim() || null;
const AGENCY_ROOT = resolveAgencyRoot();

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

function departmentRolesForDivision(division) {
  return DIVISION_TO_DEPARTMENT_ROLES[division] ?? [division.replace(/-/g, '_'), division];
}

function recommendedSkillsForFile(fileBasename, division) {
  let extra = EXTRA_SKILLS_BY_BASENAME[fileBasename];
  if (!extra && division === 'engineering') {
    extra = DEFAULT_ENGINEERING_EXTRA;
  }
  extra = Array.isArray(extra) ? extra : [];
  return Array.from(new Set([...BASE_EXECUTOR_SKILLS, ...extra]));
}

function buildFoundryEmployeePrompt(displayName, agencyBody, recommendedSkills, division) {
  const skillBlock = recommendedSkills.map((s) => `- ${s}`).join('\n');
  const deptLabel = division === 'engineering' ? '工程部' : division;
  return [
    agencyBody,
    '',
    '---',
    '## Foundry 执行约束（平台运行时）',
    `你是${deptLabel}员工「${displayName}」，向本部门总监汇报，通过 Foundry 任务/Issue 接收工作。`,
    '- 交付须可验收；改仓库须通过已绑定 Skill 工具（code-run、file-write 等）执行，不得在正文中假装已调用。',
    '- 高风险命令须等待审批；完成后使用 employee-task-reporter 汇报进度与 blockers。',
    '',
    '### 推荐 Skills（运行时工具白名单）',
    skillBlock,
  ].join('\n');
}

function matchesDivisionFilter(rel) {
  if (!DIVISION_FILTER) return true;
  const prefix = `${DIVISION_FILTER}/`;
  return rel === DIVISION_FILTER || rel.startsWith(prefix);
}

async function main() {
  let stat;
  try {
    stat = statSync(AGENCY_ROOT);
  } catch {
    console.error(
      `未找到 agency-agents 目录: ${AGENCY_ROOT}\n` +
        `请确保 docs/agency-agents 存在，或: git clone https://github.com/msitarzewski/agency-agents.git vendor/agency-agents\n` +
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
    if (!matchesDivisionFilter(rel)) continue;

    const raw = readFileSync(fullPath, 'utf8');
    const parsed = parseAgentMarkdown(raw);
    const body = parsed.content;
    const data = parsed.data || {};

    const baseName = basename(fullPath, '.md');
    const nameFromFm =
      (typeof data.name === 'string' && data.name.trim()) || firstHeading(body) || baseName;
    const emoji = typeof data.emoji === 'string' ? data.emoji.trim() : '';
    const displayName = emoji ? `${emoji} ${nameFromFm}`.slice(0, 255) : nameFromFm.slice(0, 255);

    const description = typeof data.description === 'string' ? data.description.trim() : null;
    const expertise =
      (typeof data.vibe === 'string' && data.vibe.trim()) ||
      (description ? description.slice(0, 500) : null);

    const division = rel.includes('/') ? rel.split('/')[0] : 'root';
    const departmentRoles = departmentRolesForDivision(division);
    const recommendedSkills = recommendedSkillsForFile(baseName, division);
    const systemPrompt = buildFoundryEmployeePrompt(
      nameFromFm,
      body || '',
      recommendedSkills,
      division,
    );

    const metadata = {
      source: 'agency-agents',
      sourceRepo: 'https://github.com/msitarzewski/agency-agents',
      license: 'MIT',
      division,
      relativePath: rel,
      agencyBasename: baseName,
      color: data.color ?? null,
      emoji: data.emoji ?? null,
      vibe: data.vibe ?? null,
      foundryAgentCategory: 'employee',
      importVersion: 'v2',
    };

    rows.push({
      slug: slugFromRelPath(rel),
      name: displayName,
      description,
      expertise,
      system_prompt: systemPrompt,
      metadata,
      is_published: PUBLISH,
      agent_category: 'employee',
      department_roles: departmentRoles,
      skill_tags: departmentRoles,
      recommended_skills: recommendedSkills,
    });
  }

  const filterNote = DIVISION_FILTER ? `（仅分部: ${DIVISION_FILTER}）` : '';
  console.log(`扫描 ${AGENCY_ROOT}${filterNote}：共 ${rows.length} 个 agent .md`);

  if (rows.length === 0) {
    console.error('未匹配到任何 .md，请检查 AGENCY_AGENTS_ROOT / AGENCY_AGENTS_DIVISION');
    process.exit(1);
  }

  if (DRY) {
    for (const r of rows) {
      console.log(`  - ${r.slug}  ${r.name}`);
    }
    console.log('DRY_RUN=1，未写入数据库。');
    process.exit(0);
  }

  const databaseUrl = resolveDatabaseUrl();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    let affected = 0;
    for (const r of rows) {
      const res = await client.query(
        `
        INSERT INTO marketplace_agents (
          slug, name, description, expertise, system_prompt,
          is_published, recommended_skills, metadata,
          agent_category, department_roles, skill_tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::text[], $11::text[])
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          expertise = EXCLUDED.expertise,
          system_prompt = EXCLUDED.system_prompt,
          is_published = EXCLUDED.is_published,
          recommended_skills = EXCLUDED.recommended_skills,
          metadata = EXCLUDED.metadata,
          agent_category = EXCLUDED.agent_category,
          department_roles = EXCLUDED.department_roles,
          skill_tags = EXCLUDED.skill_tags,
          updated_at = CURRENT_TIMESTAMP
      `,
        [
          r.slug,
          r.name,
          r.description,
          r.expertise,
          r.system_prompt,
          r.is_published,
          JSON.stringify(r.recommended_skills),
          JSON.stringify(r.metadata),
          r.agent_category,
          r.department_roles,
          r.skill_tags,
        ],
      );
      affected += res.rowCount ?? 0;
      console.log(`  ✓ ${r.slug}`);
    }
    console.log(`完成：${rows.length} 条 agency 员工已 upsert 至 marketplace（affected rows≈${affected}）。`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
