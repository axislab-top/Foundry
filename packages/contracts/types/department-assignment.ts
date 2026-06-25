/**
 * 部门能力解析与 L2 任务类型匹配（平台模板 + 组织节点 metadata 共用）。
 */

import type { PlatformDepartmentDefinition } from './departments.js';

/** 职能摘要最少字符数（与 API 校验一致）。 */
export const DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS = 8;

export type DepartmentCapabilitiesSource =
  | 'platform_template'
  | 'user_defined'
  | 'user_defined_no_tags'
  | 'suggested'
  | 'node_metadata'
  | 'slug_heuristic_fallback';

export interface DepartmentCapability {
  /** 组织快照 routable slug（编排指派键） */
  slug: string;
  name: string;
  organizationNodeId?: string;
  platformDepartmentSlug?: string | null;
  responsibilitySummary?: string;
  taskTypeTags: string[];
  excludesTaskTypeTags?: string[];
  capabilitiesSource?: DepartmentCapabilitiesSource;
}

export interface OrgSnapshotDepartmentInput {
  id: string;
  name: string;
  slug: string;
  platformDepartmentSlug?: string | null;
  metadata?: Record<string, unknown> | null;
  description?: string | null;
}

export interface PlatformDepartmentCapabilityRow {
  slug: string;
  responsibilitySummary?: string | null;
  taskTypeTags?: string[] | null;
  excludesTaskTypeTags?: string[] | null;
}

export interface ResolveDepartmentCapabilityParams {
  department: OrgSnapshotDepartmentInput;
  platformRow?: PlatformDepartmentCapabilityRow | null;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const s = String(t ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** 从节点 metadata / 平台行 / description 解析部门能力（节点优先）。 */
export function resolveDepartmentCapability(params: ResolveDepartmentCapabilityParams): DepartmentCapability {
  const { department, platformRow } = params;
  const meta =
    department.metadata && typeof department.metadata === 'object' && !Array.isArray(department.metadata)
      ? (department.metadata as Record<string, unknown>)
      : {};

  const platformSlug =
    readMetaString(meta, 'platformDepartmentSlug') ||
    (department.platformDepartmentSlug ? String(department.platformDepartmentSlug).trim() : '') ||
    null;

  let summary = readMetaString(meta, 'responsibilitySummary');
  let tags = normalizeTags(meta['taskTypeTags']);
  let excludes = normalizeTags(meta['excludesTaskTypeTags']);
  let source: DepartmentCapabilitiesSource | undefined =
    typeof meta['capabilitiesSource'] === 'string'
      ? (meta['capabilitiesSource'] as DepartmentCapabilitiesSource)
      : undefined;

  if (summary || tags.length) {
    source = source ?? 'node_metadata';
  } else if (platformRow) {
    summary = String(platformRow.responsibilitySummary ?? '').trim();
    tags = normalizeTags(platformRow.taskTypeTags);
    excludes = normalizeTags(platformRow.excludesTaskTypeTags);
    source = 'platform_template';
  }

  if (!summary) {
    summary = String(department.description ?? '').trim();
  }

  if (!tags.length && summary) {
    source = source ?? 'user_defined_no_tags';
  }

  if (!summary && !tags.length) {
    source = 'slug_heuristic_fallback';
  }

  return {
    slug: department.slug,
    name: department.name,
    organizationNodeId: department.id,
    platformDepartmentSlug: platformSlug,
    responsibilitySummary: summary || undefined,
    taskTypeTags: tags,
    ...(excludes.length ? { excludesTaskTypeTags: excludes } : {}),
    capabilitiesSource: source,
  };
}

export function validateResponsibilitySummary(text: string): { ok: true } | { ok: false; message: string } {
  const t = String(text ?? '').trim();
  if (t.length < DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS) {
    return {
      ok: false,
      message: `职能摘要至少 ${DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS} 个字符`,
    };
  }
  return { ok: true };
}

export function buildDepartmentCapabilitiesFromPlatformDefs(
  defs: readonly PlatformDepartmentDefinition[],
): DepartmentCapability[] {
  return defs.map((d) => ({
    slug: d.slug,
    name: d.labelZh,
    platformDepartmentSlug: d.slug,
    responsibilitySummary: d.responsibilitySummary,
    taskTypeTags: [...d.taskTypeTags],
    ...(d.excludesTaskTypeTags?.length ? { excludesTaskTypeTags: [...d.excludesTaskTypeTags] } : {}),
    capabilitiesSource: 'platform_template' as const,
  }));
}

/** 交付物关键词 → 阶段任务类型标签 */
export const TASK_TYPE_KEYWORD_RULES: ReadonlyArray<{
  tags: readonly string[];
  pattern: RegExp;
}> = [
  {
    tags: ['software_delivery', 'tech_feasibility'],
    pattern:
      /html|css|代码|前端|响应式|浏览器|工程化|开发|实现|技术可行性|纯html|website|landing|交付代码|web\s*page|technical\s*feasibility|frontend|implementation/i,
  },
  {
    tags: ['brand_copy', 'marketing_content'],
    pattern:
      /品牌|文案|定位|价值主张|cta|视觉|传播|内容对齐|传达|homepage.*介绍|核心价值|brand|copywriting|positioning|value\s*proposition/i,
  },
  {
    tags: ['lead_generation', 'growth_metrics'],
    pattern:
      /访问量|月活|UV|PV|自然流量|搜索引擎|线索|SQL|MQL|获客|潜客|市场认知|品牌曝光|投放效果|转化|增长指标|traffic|organic|monthly\s*visitors|search\s*engine|lead\s*generation/i,
  },
  {
    tags: ['paid_acquisition'],
    pattern: /付费投放|广告账户|sem|ppc|cpc|cpm|投放预算|paid\s*media|ad\s*spend/i,
  },
  {
    tags: ['finance_audit', 'budget'],
    pattern:
      /预算编制|财报|审计|税务|发票|成本核算|现金流|固定资产|薪酬核算|费用报销|财务合规|\baudit\b|tax\s*return|P&L|balance\s*sheet/i,
  },
  {
    tags: ['hr_recruiting', 'hr_operations'],
    pattern:
      /招聘|入职|离职|薪酬结构|绩效面谈|劳动合同|考勤|编制|培训体系|组织发展|\bonboarding\b|offboarding|payroll|performance\s*review/i,
  },
  {
    tags: ['social_media_ops'],
    pattern:
      /小红书|推文|笔记|新媒体|社媒|互动|评论区|种草|kol|达人|投放素材|短视频|直播带货|公众号|xiaohongshu|red\s*book|social\s*media|ugc|influencer|community\s*management/i,
  },
  {
    tags: ['legal_contract'],
    pattern: /合同|法务|合规审查|隐私政策|知识产权|诉讼|legal|contract\s*review/i,
  },
  {
    tags: ['product_discovery'],
    pattern: /prd|需求文档|用户故事|产品路线|roadmap|原型|product\s*discovery/i,
  },
  {
    tags: ['qa_testing'],
    pattern: /测试用例|回归测试|自动化测试|qa|quality\s*assurance|e2e\s*test/i,
  },
  {
    tags: ['customer_support'],
    pattern: /客服|工单|sla|售后|support\s*ticket|客户满意度/i,
  },
  {
    tags: ['supply_chain_ops'],
    pattern: /供应链|采购|库存|物流|vendor|fulfillment/i,
  },
  {
    tags: ['design_delivery'],
    pattern: /ui\s*设计|ux|视觉稿|figma|设计稿|design\s*system/i,
  },
  {
    tags: ['project_coordination'],
    pattern: /项目计划|里程碑|跨部门排期|项目管理|pmo|gantt/i,
  },
  {
    tags: ['strategy_planning'],
    pattern: /战略规划|竞争分析|市场进入|战略路线图|strategy\s*plan/i,
  },
];

export function classifyPhaseTaskTypes(title: string, outcome: string, responsibilitySummary?: string): string[] {
  const text = [title, outcome, responsibilitySummary ?? ''].filter(Boolean).join('\n');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rule of TASK_TYPE_KEYWORD_RULES) {
    if (!rule.pattern.test(text)) continue;
    for (const tag of rule.tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export interface ScoreDepartmentForPhaseParams {
  phaseTaskTypes: string[];
  candidates: DepartmentCapability[];
  /** 无匹配时的兜底 slug（须在 candidates 内） */
  fallbackSlug?: string;
}

export interface ScoreDepartmentForPhaseResult {
  department: string;
  score: number;
  rationale: string;
  phaseTaskTypes: string[];
}

function tagOverlap(phaseTypes: string[], dept: DepartmentCapability): number {
  if (!phaseTypes.length) return 0;
  const deptTags = new Set(dept.taskTypeTags);
  if (!deptTags.size) return 0;
  let n = 0;
  for (const t of phaseTypes) {
    if (deptTags.has(t)) n += 1;
  }
  return n;
}

function hasExcludedConflict(phaseTypes: string[], dept: DepartmentCapability): boolean {
  const ex = dept.excludesTaskTypeTags ?? [];
  if (!ex.length || !phaseTypes.length) return false;
  const exSet = new Set(ex);
  return phaseTypes.some((t) => exSet.has(t));
}

function slugNameBonus(phaseTypes: string[], dept: DepartmentCapability): number {
  const s = dept.slug.toLowerCase();
  const name = dept.name.toLowerCase();
  let bonus = 0;
  const has = (re: RegExp) => re.test(s) || re.test(name);
  if (phaseTypes.includes('software_delivery') || phaseTypes.includes('tech_feasibility')) {
    if (has(/技术|研发|工程|开发|dev|tech|it|产研|软件|engineering/)) bonus += 2;
  }
  if (phaseTypes.includes('lead_generation') || phaseTypes.includes('growth_metrics')) {
    if (has(/市场|营销|增长|销售|marketing|sales|growth/)) bonus += 2;
    if (has(/财务|finance/)) bonus -= 4;
  }
  if (phaseTypes.includes('finance_audit') || phaseTypes.includes('budget')) {
    if (has(/财务|finance|会计/)) bonus += 3;
  }
  if (phaseTypes.includes('social_media_ops')) {
    if (has(/市场|营销|内容|creative|content/)) bonus += 2;
    if (has(/人力|人事|hr/)) bonus -= 4;
  }
  if (phaseTypes.includes('hr_recruiting') || phaseTypes.includes('hr_operations')) {
    if (has(/人力|人事|hr/)) bonus += 3;
  }
  return bonus;
}

export function scoreDepartmentForPhase(params: ScoreDepartmentForPhaseParams): ScoreDepartmentForPhaseResult {
  const { phaseTaskTypes, candidates, fallbackSlug } = params;
  if (!candidates.length) {
    return {
      department: fallbackSlug ?? 'project-management',
      score: 0,
      rationale: 'no_candidates',
      phaseTaskTypes,
    };
  }

  let best = candidates[0]!;
  let bestScore = -Infinity;

  for (const dept of candidates) {
    if (hasExcludedConflict(phaseTaskTypes, dept)) continue;
    const overlap = tagOverlap(phaseTaskTypes, dept);
    const summaryBoost =
      dept.responsibilitySummary && phaseTaskTypes.length === 0
        ? classifyPhaseTaskTypes('', '', dept.responsibilitySummary).length > 0
          ? 0.5
          : 0
        : 0;
    const score = overlap * 10 + slugNameBonus(phaseTaskTypes, dept) + summaryBoost;
    if (score > bestScore) {
      bestScore = score;
      best = dept;
    } else if (score === bestScore && score > -Infinity) {
      if (dept.slug.localeCompare(best.slug, 'zh-Hans') < 0) best = dept;
    }
  }

  if (bestScore <= 0 && phaseTaskTypes.length > 0) {
    const filtered = candidates.filter((d) => !hasExcludedConflict(phaseTaskTypes, d));
    if (filtered.length) {
      best = filtered[0]!;
      bestScore = slugNameBonus(phaseTaskTypes, best);
      for (const d of filtered.slice(1)) {
        const sc = slugNameBonus(phaseTaskTypes, d);
        if (sc > bestScore) {
          bestScore = sc;
          best = d;
        }
      }
    }
  }

  const department =
    bestScore > -Infinity ? best.slug : (fallbackSlug && candidates.some((c) => c.slug === fallbackSlug) ? fallbackSlug : candidates[0]!.slug);

  return {
    department,
    score: Math.max(0, bestScore),
    rationale:
      bestScore > 0
        ? `tag_overlap:${tagOverlap(phaseTaskTypes, best)};slug:${best.slug}`
        : `fallback:${department}`,
    phaseTaskTypes,
  };
}

export function capabilitiesForAssignablePool(
  capabilities: DepartmentCapability[],
  assignableSlugs: string[],
): DepartmentCapability[] {
  const pool = new Set(assignableSlugs.map((s) => String(s).trim()).filter(Boolean));
  return capabilities.filter((c) => pool.has(c.slug));
}
