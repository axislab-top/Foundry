/**
 * Axis DevForge — 平台标准部门单一 Truth Source（2026）
 * 由 `pnpm run generate:departments` 同步生成前端选项、校验与 seed 片段。
 */
import { resolvePlatformCapabilityDefaults } from './department-platform-capabilities.js';

export type PlatformDepartmentCategory =
  | 'core'
  | 'revenue'
  | 'corporate'
  | 'ai'
  | 'content_creative'
  | 'operations'
  | 'other';

export interface PlatformDepartmentDefinition {
  /** 稳定键：组织树、Memory、Runner 子路径、快照元数据 */
  slug: string;
  labelZh: string;
  category: PlatformDepartmentCategory;
  /** 推荐匹配商城 Head Agent 的 role token（写入提示与校验） */
  recommendedHeadToken: string;
  /** 默认推荐技能 slug（不含全局 4 个管理 skills，由 merge 逻辑追加） */
  defaultSkills: readonly string[];
  /** Lucide/emoji 短码，供 UI */
  icon: string;
  /** 平台模板职能摘要（≥8 字；公司节点可从模板拷贝） */
  responsibilitySummary: string;
  /** 机读任务类型标签，供 L2 编排匹配 */
  taskTypeTags: readonly string[];
  /** 明确不应承接的任务类型 */
  excludesTaskTypeTags?: readonly string[];
}

function withCapabilities<const T extends Omit<PlatformDepartmentDefinition, 'responsibilitySummary' | 'taskTypeTags' | 'excludesTaskTypeTags'>>(
  base: T,
): T & Pick<PlatformDepartmentDefinition, 'responsibilitySummary' | 'taskTypeTags' | 'excludesTaskTypeTags'> {
  const cap = resolvePlatformCapabilityDefaults(base.slug, base.labelZh, base.category);
  return {
    ...base,
    responsibilitySummary: cap.responsibilitySummary,
    taskTypeTags: cap.taskTypeTags,
    ...(cap.excludesTaskTypeTags?.length ? { excludesTaskTypeTags: cap.excludesTaskTypeTags } : {}),
  };
}

/**
 * 平台部门模板（与 Admin / platform_departments 一致，共 18 条；顺序即默认 sort_order）。
 */
const PLATFORM_DEPARTMENTS_BASE = [
  {
    slug: 'engineering',
    labelZh: '工程部',
    category: 'core',
    recommendedHeadToken: 'engineering',
    defaultSkills: ['code-review-assistant', 'ci-pipeline-helper'],
    icon: 'cpu',
  },
  {
    slug: 'design',
    labelZh: '设计部',
    category: 'content_creative',
    recommendedHeadToken: 'design',
    defaultSkills: ['design-critique', 'accessibility-pass'],
    icon: 'pen-tool',
  },
  {
    slug: 'marketing',
    labelZh: '营销部',
    category: 'revenue',
    recommendedHeadToken: 'marketing',
    defaultSkills: ['campaign-planner', 'seo-brief-generator'],
    icon: 'megaphone',
  },
  {
    slug: 'paid-media',
    labelZh: '付费媒体部',
    category: 'revenue',
    recommendedHeadToken: 'paid_media',
    defaultSkills: ['campaign-planner', 'funnel-analyst'],
    icon: 'circle-dollar-sign',
  },
  {
    slug: 'sales',
    labelZh: '销售部',
    category: 'revenue',
    recommendedHeadToken: 'sales',
    defaultSkills: ['crm-summary', 'proposal-outline'],
    icon: 'handshake',
  },
  {
    slug: 'finance',
    labelZh: '金融财务部',
    category: 'corporate',
    recommendedHeadToken: 'finance',
    defaultSkills: ['budget-variance-helper', 'invoice-checklist'],
    icon: 'landmark',
  },
  {
    slug: 'hr',
    labelZh: '人力资源部',
    category: 'corporate',
    recommendedHeadToken: 'hr',
    defaultSkills: ['jd-writer', 'interview-rubric'],
    icon: 'users',
  },
  {
    slug: 'legal',
    labelZh: '法务部',
    category: 'corporate',
    recommendedHeadToken: 'legal',
    defaultSkills: ['contract-clause-review', 'policy-diff'],
    icon: 'scale',
  },
  {
    slug: 'supply-chain',
    labelZh: '供应链部',
    category: 'operations',
    recommendedHeadToken: 'supply_chain',
    defaultSkills: ['ops-playbook', 'vendor-onboarding-checklist'],
    icon: 'truck',
  },
  {
    slug: 'product',
    labelZh: '产品部',
    category: 'core',
    recommendedHeadToken: 'product',
    defaultSkills: ['prd-writer', 'user-story-refiner'],
    icon: 'layout-dashboard',
  },
  {
    slug: 'project-management',
    labelZh: '项目管理部',
    category: 'core',
    recommendedHeadToken: 'project_management',
    defaultSkills: ['prd-writer', 'sla-tracker'],
    icon: 'kanban',
  },
  {
    slug: 'qa',
    labelZh: '测试部',
    category: 'core',
    recommendedHeadToken: 'qa',
    defaultSkills: ['code-review-assistant', 'ci-pipeline-helper'],
    icon: 'test-tube-diagonal',
  },
  {
    slug: 'support',
    labelZh: '支持部',
    category: 'operations',
    recommendedHeadToken: 'support',
    defaultSkills: ['ops-playbook', 'office-policy-faq'],
    icon: 'life-buoy',
  },
  {
    slug: 'special-projects',
    labelZh: '专项部',
    category: 'other',
    recommendedHeadToken: 'special_projects',
    defaultSkills: ['ops-playbook', 'deal-desk-checklist'],
    icon: 'target',
  },
  {
    slug: 'spatial-computing',
    labelZh: '空间计算部',
    category: 'core',
    recommendedHeadToken: 'spatial_computing',
    defaultSkills: ['code-review-assistant', 'design-critique'],
    icon: 'box',
  },
  {
    slug: 'game-development',
    labelZh: '游戏开发部',
    category: 'core',
    recommendedHeadToken: 'game_development',
    defaultSkills: ['code-review-assistant', 'concept-board'],
    icon: 'gamepad-2',
  },
  {
    slug: 'strategy',
    labelZh: '战略部',
    category: 'corporate',
    recommendedHeadToken: 'strategy',
    defaultSkills: ['experiment-designer', 'deal-desk-checklist'],
    icon: 'compass',
  },
  {
    slug: 'research-intelligence',
    labelZh: '市场研究情报部',
    category: 'ai',
    recommendedHeadToken: 'research_intelligence',
    defaultSkills: ['research-market-intelligence-synthesizer', 'research-fundamental-analyst'],
    icon: 'telescope',
  },
] as const;

export const PLATFORM_DEPARTMENTS = PLATFORM_DEPARTMENTS_BASE.map((d) =>
  withCapabilities(d),
) as readonly PlatformDepartmentDefinition[];

export type PlatformDepartmentSlug = (typeof PLATFORM_DEPARTMENTS)[number]['slug'];

export function departmentDefinitionsBySlug(): Map<string, PlatformDepartmentDefinition> {
  return new Map(PLATFORM_DEPARTMENTS.map((d) => [d.slug, d]));
}

/** slug / token → 中文名（与历史 DEPARTMENT_ROLE_TOKEN_TO_ZH 对齐用途） */
export function buildDepartmentTokenToZhMap(
  defs: readonly PlatformDepartmentDefinition[] = PLATFORM_DEPARTMENTS,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of defs) {
    out[d.slug] = d.labelZh;
    out[d.recommendedHeadToken] = d.labelZh;
    const norm = d.recommendedHeadToken.toLowerCase().replace(/\s+/g, '_');
    out[norm] = d.labelZh;
  }
  return out;
}
