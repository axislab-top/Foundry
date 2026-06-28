/**
 * 从已发布的 department_head 商城 Agent 恢复 platform_departments（非迁移）。
 * 并补充组织树常用的 admin / operations（无总监时可先留空）。
 *
 * Usage:
 *   node scripts/restore-platform-departments.mjs
 *   DRY_RUN=1 node scripts/restore-platform-departments.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const DEFAULT_NEW_COMPANY_SLUGS = new Set([
  'admin',
  'finance',
  'hr',
  'marketing',
  'operations',
  'product',
  'sales',
]);

const DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS = [
  'director-task-delegator',
  'director-subordinate-reviewer',
  'director-team-performance-coach',
  'director-progress-reporter',
];

/** 与 packages/contracts PLATFORM_DEPARTMENTS + capability 对齐 */
const DEPT_CATALOG = {
  engineering: {
    displayName: '工程部',
    category: 'core',
    icon: 'cpu',
    recommendedHeadToken: 'engineering',
    defaultSkills: ['code-review-assistant', 'ci-pipeline-helper'],
    responsibilitySummary: '工程部负责产品研发、工程实现、技术可行性与代码交付。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['software_delivery', 'tech_feasibility'],
    excludesTaskTypeTags: [],
    sortOrder: 0,
  },
  design: {
    displayName: '设计部',
    category: 'content_creative',
    icon: 'pen-tool',
    recommendedHeadToken: 'design',
    defaultSkills: ['design-critique', 'accessibility-pass'],
    responsibilitySummary: '设计部负责UI/UX、视觉稿与设计系统。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['design_delivery', 'brand_copy'],
    excludesTaskTypeTags: [],
    sortOrder: 1,
  },
  marketing: {
    displayName: '营销部',
    category: 'revenue',
    icon: 'megaphone',
    recommendedHeadToken: 'marketing',
    defaultSkills: ['campaign-planner', 'seo-brief-generator'],
    responsibilitySummary: '营销部负责品牌、获客、市场活动与 organic 增长。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['brand_copy', 'lead_generation', 'growth_metrics', 'marketing_content'],
    excludesTaskTypeTags: [],
    sortOrder: 2,
  },
  'paid-media': {
    displayName: '付费媒体部',
    category: 'revenue',
    icon: 'circle-dollar-sign',
    recommendedHeadToken: 'paid_media',
    defaultSkills: ['campaign-planner', 'funnel-analyst'],
    responsibilitySummary: '付费媒体部负责付费投放、广告账户与投放效果优化。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['paid_acquisition', 'lead_generation', 'growth_metrics'],
    excludesTaskTypeTags: [],
    sortOrder: 3,
  },
  sales: {
    displayName: '销售部',
    category: 'revenue',
    icon: 'handshake',
    recommendedHeadToken: 'sales',
    defaultSkills: ['crm-summary', 'proposal-outline'],
    responsibilitySummary: '销售部负责商机跟进、签约与客户收入达成。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['lead_generation', 'growth_metrics'],
    excludesTaskTypeTags: [],
    sortOrder: 4,
  },
  finance: {
    displayName: '金融财务部',
    category: 'corporate',
    icon: 'landmark',
    recommendedHeadToken: 'finance',
    defaultSkills: ['budget-variance-helper', 'invoice-checklist'],
    responsibilitySummary: '金融财务部负责预算、核算、税务、审计与财务合规。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['finance_audit', 'budget'],
    excludesTaskTypeTags: ['lead_generation', 'social_media_ops', 'growth_metrics'],
    sortOrder: 5,
  },
  hr: {
    displayName: '人力资源部',
    category: 'corporate',
    icon: 'users',
    recommendedHeadToken: 'hr',
    defaultSkills: ['jd-writer', 'interview-rubric'],
    responsibilitySummary: '人力资源部负责招聘、人事流程、薪酬与组织发展。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['hr_recruiting', 'hr_operations'],
    excludesTaskTypeTags: ['social_media_ops', 'paid_acquisition'],
    sortOrder: 6,
  },
  legal: {
    displayName: '法务部',
    category: 'corporate',
    icon: 'scale',
    recommendedHeadToken: 'legal',
    defaultSkills: ['contract-clause-review', 'policy-diff'],
    responsibilitySummary: '法务部负责合同审查、合规与知识产权。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['legal_contract'],
    excludesTaskTypeTags: [],
    sortOrder: 7,
  },
  'supply-chain': {
    displayName: '供应链部',
    category: 'operations',
    icon: 'truck',
    recommendedHeadToken: 'supply_chain',
    defaultSkills: ['ops-playbook', 'vendor-onboarding-checklist'],
    responsibilitySummary: '供应链部负责采购、库存、物流与供应商管理。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['supply_chain_ops'],
    excludesTaskTypeTags: [],
    sortOrder: 8,
  },
  product: {
    displayName: '产品部',
    category: 'core',
    icon: 'layout-dashboard',
    recommendedHeadToken: 'product',
    defaultSkills: ['prd-writer', 'user-story-refiner'],
    responsibilitySummary: '产品部负责需求定义、PRD、路线图与验收标准。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['product_discovery', 'project_coordination'],
    excludesTaskTypeTags: [],
    sortOrder: 9,
  },
  'project-management': {
    displayName: '项目管理部',
    category: 'core',
    icon: 'kanban',
    recommendedHeadToken: 'project_management',
    defaultSkills: ['prd-writer', 'sla-tracker'],
    responsibilitySummary: '项目管理部负责里程碑、排期与跨部门项目协调。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['project_coordination'],
    excludesTaskTypeTags: [],
    sortOrder: 10,
  },
  qa: {
    displayName: '测试部',
    category: 'core',
    icon: 'test-tube-diagonal',
    recommendedHeadToken: 'qa',
    defaultSkills: ['code-review-assistant', 'ci-pipeline-helper'],
    responsibilitySummary: '测试部负责测试策略、用例与质量门禁。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['qa_testing', 'software_delivery'],
    excludesTaskTypeTags: [],
    sortOrder: 11,
  },
  support: {
    displayName: '支持部',
    category: 'operations',
    icon: 'life-buoy',
    recommendedHeadToken: 'support',
    defaultSkills: ['ops-playbook', 'office-policy-faq'],
    responsibilitySummary: '支持部负责客户工单、售后与满意度。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['customer_support'],
    excludesTaskTypeTags: [],
    sortOrder: 12,
  },
  'special-projects': {
    displayName: '专项部',
    category: 'other',
    icon: 'target',
    recommendedHeadToken: 'special_projects',
    defaultSkills: ['ops-playbook', 'deal-desk-checklist'],
    responsibilitySummary: '专项部负责跨职能专项攻关与临时项目交付。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['project_coordination', 'strategy_planning'],
    excludesTaskTypeTags: [],
    sortOrder: 13,
  },
  'spatial-computing': {
    displayName: '空间计算部',
    category: 'core',
    icon: 'box',
    recommendedHeadToken: 'spatial_computing',
    defaultSkills: ['code-review-assistant', 'design-critique'],
    responsibilitySummary: '空间计算部负责空间计算、XR 相关工程与产品实现。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['software_delivery', 'tech_feasibility', 'design_delivery'],
    excludesTaskTypeTags: [],
    sortOrder: 14,
  },
  'research-intelligence': {
    displayName: '市场研究情报部',
    category: 'ai',
    icon: 'telescope',
    recommendedHeadToken: 'research_intelligence',
    defaultSkills: ['research-market-intelligence-synthesizer', 'research-fundamental-analyst'],
    responsibilitySummary:
      '市场研究情报部负责信息获取、基本面研究与投资情报产出，为量化、风控、执行与组合决策提供可验收研究输入。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['market_research', 'fundamental_analysis', 'investment_intelligence'],
    excludesTaskTypeTags: ['software_delivery', 'design_delivery', 'customer_support'],
    sortOrder: 15,
  },
  admin: {
    displayName: '行政部',
    category: 'corporate',
    icon: 'building-2',
    recommendedHeadToken: 'admin',
    defaultSkills: ['ops-playbook', 'office-policy-faq'],
    responsibilitySummary: '行政部负责行政后勤、办公保障与内部协调。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['hr_operations', 'project_coordination'],
    excludesTaskTypeTags: [],
    sortOrder: 20,
  },
  operations: {
    displayName: '生产/运营部',
    category: 'operations',
    icon: 'factory',
    recommendedHeadToken: 'operations',
    defaultSkills: ['ops-playbook', 'sla-tracker'],
    responsibilitySummary: '生产/运营部负责生产运营、流程执行与交付保障。对接跨部门需求时以可验收交付物为边界。',
    taskTypeTags: ['supply_chain_ops', 'project_coordination'],
    excludesTaskTypeTags: [],
    sortOrder: 21,
  },
};

function loadEnvFromFile() {
  const tryPaths = [
    join(__dirname, '../../../.env'),
    join(__dirname, '../../../.env.local'),
    join(__dirname, '../../.env'),
    join(__dirname, '../../../infrastructure/postgres/.env'),
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

function mergeDepartmentHeadRecommendedSkills(existing) {
  const ordered = [...DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS];
  const seen = new Set(ordered);
  for (const x of existing ?? []) {
    const t = typeof x === 'string' ? x.trim() : '';
    if (t && !seen.has(t)) {
      ordered.push(t);
      seen.add(t);
    }
  }
  return ordered;
}

function deptSlugFromDirectorSlug(directorSlug) {
  const m = String(directorSlug || '').match(/^director-(.+)-v\d+$/i);
  return m ? m[1].toLowerCase() : null;
}

function catalogFor(slug) {
  const row = DEPT_CATALOG[slug];
  if (!row) {
    return {
      displayName: slug,
      category: 'other',
      icon: null,
      recommendedHeadToken: slug.replace(/-/g, '_'),
      defaultSkills: [],
      responsibilitySummary: `${slug} 部门负责该职能范围内的可验收交付。对接跨部门需求时以可验收交付物为边界。`,
      taskTypeTags: ['project_coordination'],
      excludesTaskTypeTags: [],
      sortOrder: 99,
    };
  }
  return row;
}

async function insertDepartment(client, { slug, directorId }) {
  const meta = catalogFor(slug);
  const isDefault = DEFAULT_NEW_COMPANY_SLUGS.has(slug);

  const exists = await client.query(`SELECT id FROM platform_departments WHERE slug = $1`, [slug]);
  if (exists.rowCount > 0) {
    return { slug, status: 'skipped_exists', id: exists.rows[0].id };
  }

  if (directorId) {
    const conflict = await client.query(
      `SELECT slug FROM platform_departments WHERE director_marketplace_agent_id = $1`,
      [directorId],
    );
    if (conflict.rowCount > 0) {
      return { slug, status: 'skipped_director_taken', other: conflict.rows[0].slug };
    }
  }

  if (DRY_RUN) {
    return { slug, status: 'dry_run', displayName: meta.displayName, directorId };
  }

  const ins = await client.query(
    `
      INSERT INTO platform_departments (
        slug, display_name, sort_order, is_default_for_new_company,
        category, icon, recommended_head_token, default_skills,
        responsibility_summary, task_type_tags, excludes_task_type_tags,
        director_marketplace_agent_id
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8::jsonb,
        $9, $10::jsonb, $11::jsonb,
        $12
      )
      RETURNING id
    `,
    [
      slug,
      meta.displayName,
      meta.sortOrder,
      isDefault,
      meta.category,
      meta.icon,
      meta.recommendedHeadToken,
      JSON.stringify(meta.defaultSkills),
      meta.responsibilitySummary,
      JSON.stringify(meta.taskTypeTags),
      JSON.stringify(meta.excludesTaskTypeTags),
      directorId,
    ],
  );
  const deptId = ins.rows[0].id;

  if (directorId) {
    const agentRes = await client.query(
      `SELECT id, recommended_skills FROM marketplace_agents WHERE id = $1`,
      [directorId],
    );
    const agent = agentRes.rows[0];
    const mergedSkills = mergeDepartmentHeadRecommendedSkills(agent.recommended_skills);
    const departmentRoles = [slug, meta.displayName];
    await client.query(
      `
        UPDATE marketplace_agents
        SET
          agent_category = 'department_head',
          department_roles = $1::text[],
          recommended_skills = $2::jsonb,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `,
      [departmentRoles, JSON.stringify(mergedSkills), directorId],
    );
    await client.query(
      `
        INSERT INTO platform_department_audit_logs (
          platform_department_id, actor_user_id, action,
          previous_marketplace_agent_id, new_marketplace_agent_id
        ) VALUES ($1, $2, 'head_bound', NULL, $3)
      `,
      [deptId, '00000000-0000-4000-8000-000000000001', directorId],
    ).catch(() => {
      /* audit optional */
    });
  }

  return { slug, status: 'created', id: deptId, displayName: meta.displayName, directorId };
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  const results = [];
  try {
    const heads = await client.query(
      `
        SELECT id, slug, name
        FROM marketplace_agents
        WHERE agent_category = 'department_head' AND is_published = true
        ORDER BY slug
      `,
    );

    const slugsFromDirectors = new Set();
    for (const head of heads.rows) {
      const deptSlug = deptSlugFromDirectorSlug(head.slug);
      if (!deptSlug) {
        results.push({ directorSlug: head.slug, status: 'skipped_bad_slug' });
        continue;
      }
      slugsFromDirectors.add(deptSlug);
      results.push(await insertDepartment(client, { slug: deptSlug, directorId: head.id }));
    }

    for (const extraSlug of ['admin', 'operations']) {
      if (!slugsFromDirectors.has(extraSlug)) {
        results.push(await insertDepartment(client, { slug: extraSlug, directorId: null }));
      }
    }

    console.log(JSON.stringify({ dryRun: DRY_RUN, results }, null, 2));

    const summary = await client.query(
      `
        SELECT pd.slug, pd.display_name, ma.slug AS director_slug
        FROM platform_departments pd
        LEFT JOIN marketplace_agents ma ON ma.id = pd.director_marketplace_agent_id
        ORDER BY pd.sort_order, pd.display_name
      `,
    );
    console.log('\nplatform_departments now:', summary.rowCount);
    for (const r of summary.rows) {
      console.log(`  - ${r.slug} (${r.display_name}) → ${r.director_slug ?? '(无总监)'}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
