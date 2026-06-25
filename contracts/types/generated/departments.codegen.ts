/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit by hand. Run: pnpm run generate:departments
 */
export const GENERATED_PLATFORM_DEPARTMENT_SLUGS = [
  'engineering',
  'design',
  'marketing',
  'paid-media',
  'sales',
  'finance',
  'hr',
  'legal',
  'supply-chain',
  'product',
  'project-management',
  'qa',
  'support',
  'special-projects',
  'spatial-computing',
  'game-development',
  'strategy',
  'research-intelligence',
] as const;

export type GeneratedPlatformDepartmentSlug = (typeof GENERATED_PLATFORM_DEPARTMENT_SLUGS)[number];

export function isGeneratedPlatformDepartmentSlug(s: string): s is GeneratedPlatformDepartmentSlug {
  return (GENERATED_PLATFORM_DEPARTMENT_SLUGS as readonly string[]).includes(s);
}

/** 自 PLATFORM_DEPARTMENTS 派生的 token → 中文（供 validator / 推荐服务合并） */
export const GENERATED_DEPARTMENT_TOKEN_TO_ZH: Record<string, string> = {
  "design": "设计部",
  "engineering": "工程部",
  "finance": "金融财务部",
  "game_development": "游戏开发部",
  "game-development": "游戏开发部",
  "hr": "人力资源部",
  "legal": "法务部",
  "marketing": "营销部",
  "paid_media": "付费媒体部",
  "paid-media": "付费媒体部",
  "product": "产品部",
  "project_management": "项目管理部",
  "project-management": "项目管理部",
  "qa": "测试部",
  "research_intelligence": "市场研究情报部",
  "research-intelligence": "市场研究情报部",
  "sales": "销售部",
  "spatial_computing": "空间计算部",
  "spatial-computing": "空间计算部",
  "special_projects": "专项部",
  "special-projects": "专项部",
  "strategy": "战略部",
  "supply_chain": "供应链部",
  "supply-chain": "供应链部",
  "support": "支持部",
};
