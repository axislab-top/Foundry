/**
 * 平台部门模板默认职能（seed → platform_departments）。
 */
import type { PlatformDepartmentCategory } from './departments.js';

export interface PlatformDepartmentCapabilityDefaults {
  responsibilitySummary: string;
  taskTypeTags: readonly string[];
  excludesTaskTypeTags?: readonly string[];
}

const SUMMARY = (labelZh: string, scope: string): string =>
  `${labelZh}负责${scope}。对接跨部门需求时以可验收交付物为边界。`;

/** 与 PLATFORM_DEPARTMENTS 一致的 17 条 slug */
export const PLATFORM_DEPARTMENT_CAPABILITY_BY_SLUG: Record<string, PlatformDepartmentCapabilityDefaults> = {
  engineering: {
    responsibilitySummary: SUMMARY('工程部', '产品研发、工程实现、技术可行性与代码交付'),
    taskTypeTags: ['software_delivery', 'tech_feasibility'],
  },
  design: {
    responsibilitySummary: SUMMARY('设计部', 'UI/UX、视觉稿与设计系统'),
    taskTypeTags: ['design_delivery', 'brand_copy'],
  },
  marketing: {
    responsibilitySummary: SUMMARY('营销部', '品牌、获客、市场活动与 organic 增长'),
    taskTypeTags: ['brand_copy', 'lead_generation', 'growth_metrics', 'marketing_content'],
  },
  'paid-media': {
    responsibilitySummary: SUMMARY('付费媒体部', '付费投放、广告账户与投放效果优化'),
    taskTypeTags: ['paid_acquisition', 'lead_generation', 'growth_metrics'],
  },
  sales: {
    responsibilitySummary: SUMMARY('销售部', '商机跟进、签约与客户收入达成'),
    taskTypeTags: ['lead_generation', 'growth_metrics'],
  },
  finance: {
    responsibilitySummary: SUMMARY('金融财务部', '预算、核算、税务、审计与财务合规'),
    taskTypeTags: ['finance_audit', 'budget'],
    excludesTaskTypeTags: ['lead_generation', 'social_media_ops', 'growth_metrics'],
  },
  hr: {
    responsibilitySummary: SUMMARY('人力资源部', '招聘、人事流程、薪酬与组织发展'),
    taskTypeTags: ['hr_recruiting', 'hr_operations'],
    excludesTaskTypeTags: ['social_media_ops', 'paid_acquisition'],
  },
  legal: {
    responsibilitySummary: SUMMARY('法务部', '合同审查、合规与知识产权'),
    taskTypeTags: ['legal_contract'],
  },
  'supply-chain': {
    responsibilitySummary: SUMMARY('供应链部', '采购、库存、物流与供应商管理'),
    taskTypeTags: ['supply_chain_ops'],
  },
  product: {
    responsibilitySummary: SUMMARY('产品部', '需求定义、PRD、路线图与验收标准'),
    taskTypeTags: ['product_discovery', 'project_coordination'],
  },
  'project-management': {
    responsibilitySummary: SUMMARY('项目管理部', '里程碑、排期与跨部门项目协调'),
    taskTypeTags: ['project_coordination'],
  },
  qa: {
    responsibilitySummary: SUMMARY('测试部', '测试策略、用例与质量门禁'),
    taskTypeTags: ['qa_testing', 'software_delivery'],
  },
  support: {
    responsibilitySummary: SUMMARY('支持部', '客户工单、售后与满意度'),
    taskTypeTags: ['customer_support'],
  },
  'special-projects': {
    responsibilitySummary: SUMMARY('专项部', '跨职能专项攻关与临时项目交付'),
    taskTypeTags: ['project_coordination', 'strategy_planning'],
  },
  'spatial-computing': {
    responsibilitySummary: SUMMARY('空间计算部', '空间计算、XR 相关工程与产品实现'),
    taskTypeTags: ['software_delivery', 'tech_feasibility', 'design_delivery'],
  },
  'game-development': {
    responsibilitySummary: SUMMARY('游戏开发部', '游戏客户端、玩法实现与技术交付'),
    taskTypeTags: ['software_delivery', 'tech_feasibility'],
  },
  strategy: {
    responsibilitySummary: SUMMARY('战略部', '战略规划、竞争与市场进入分析'),
    taskTypeTags: ['strategy_planning'],
  },
  'research-intelligence': {
    responsibilitySummary: SUMMARY(
      '市场研究情报部',
      '信息获取、基本面研究与投资情报产出，为量化、风控、执行与组合决策提供可验收研究输入',
    ),
    taskTypeTags: ['market_research', 'fundamental_analysis', 'investment_intelligence'],
    excludesTaskTypeTags: ['software_delivery', 'design_delivery', 'customer_support'],
  },
};

export function capabilityDefaultsForCategory(
  slug: string,
  labelZh: string,
  category: PlatformDepartmentCategory,
): PlatformDepartmentCapabilityDefaults {
  const scopeByCategory: Record<PlatformDepartmentCategory, string> = {
    core: '核心产品与技术交付',
    revenue: '收入与市场相关交付',
    corporate: '公司治理与职能支持',
    ai: '数据与 AI 能力交付',
    content_creative: '内容与设计创意交付',
    operations: '运营与流程交付',
    other: '专项与跨职能交付',
  };
  return {
    responsibilitySummary: SUMMARY(labelZh, scopeByCategory[category] ?? '部门职责范围内的可验收交付'),
    taskTypeTags: ['project_coordination'],
  };
}

export function resolvePlatformCapabilityDefaults(
  slug: string,
  labelZh: string,
  category: PlatformDepartmentCategory,
): PlatformDepartmentCapabilityDefaults {
  return (
    PLATFORM_DEPARTMENT_CAPABILITY_BY_SLUG[slug] ??
    capabilityDefaultsForCategory(slug, labelZh, category)
  );
}
