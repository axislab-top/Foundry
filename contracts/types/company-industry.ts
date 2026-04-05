/**
 * 公司行业 code 与默认部门结构（API 组织初始化与前端向导共用）
 */

export const COMPANY_INDUSTRY_CODES = [
  'tech',
  'content',
  'ecommerce',
  'consulting',
  'education',
  'healthcare',
  'finance',
  'marketing',
  'other',
] as const;

export type CompanyIndustryCode = (typeof COMPANY_INDUSTRY_CODES)[number];

export interface IndustryPreset {
  code: CompanyIndustryCode;
  labelZh: string;
  labelEn: string;
  emoji: string;
}

export const COMPANY_INDUSTRY_PRESETS: IndustryPreset[] = [
  { code: 'tech', labelZh: '科技', labelEn: 'Technology', emoji: '🖥' },
  { code: 'content', labelZh: '内容创作', labelEn: 'Content', emoji: '✍️' },
  { code: 'ecommerce', labelZh: '电商', labelEn: 'E-commerce', emoji: '🛒' },
  { code: 'consulting', labelZh: '咨询服务', labelEn: 'Consulting', emoji: '💼' },
  { code: 'education', labelZh: '教育', labelEn: 'Education', emoji: '🎓' },
  { code: 'healthcare', labelZh: '医疗', labelEn: 'Healthcare', emoji: '🏥' },
  { code: 'finance', labelZh: '金融', labelEn: 'Finance', emoji: '💰' },
  { code: 'marketing', labelZh: '营销', labelEn: 'Marketing', emoji: '📣' },
  { code: 'other', labelZh: '其他', labelEn: 'Other', emoji: '⚙️' },
];

/** 默认科技型部门（与历史行为一致） */
const DEFAULT_DEPTS = ['Engineering', 'Product', 'Marketing', 'Sales', 'Finance', 'HR', 'Operations'];

const BY_CODE: Record<CompanyIndustryCode, string[]> = {
  tech: ['Engineering', 'Product', 'Marketing', 'Sales', 'Finance', 'HR', 'Operations'],
  content: ['Editorial', 'Video', 'Design', 'Distribution', 'Analytics', 'HR'],
  ecommerce: ['Merchandising', 'Supply Chain', 'Customer Service', 'Marketing', 'Finance', 'HR'],
  consulting: ['Client Services', 'Delivery', 'Business Development', 'Finance', 'HR'],
  education: ['Curriculum', 'Instruction', 'Student Success', 'Marketing', 'HR', 'Operations'],
  healthcare: ['Clinical', 'Compliance', 'Operations', 'Patient Services', 'HR', 'Finance'],
  finance: ['Advisory', 'Risk', 'Operations', 'Compliance', 'Marketing', 'HR'],
  marketing: ['Strategy', 'Creative', 'Performance', 'Brand', 'Analytics', 'HR'],
  other: DEFAULT_DEPTS,
};

/**
 * 根据 industryCode（优先）与 industry 展示文案推断默认部门列表。
 */
export function resolveDefaultDepartments(
  industryCode?: string | null,
  industry?: string | null,
): string[] {
  const code = (industryCode || '').trim().toLowerCase();
  if (code && (COMPANY_INDUSTRY_CODES as readonly string[]).includes(code)) {
    return BY_CODE[code as CompanyIndustryCode];
  }

  const raw = `${industry || ''}`.toLowerCase();
  if (raw.includes('consult') || raw.includes('咨询')) {
    return BY_CODE.consulting;
  }
  if (raw.includes('内容') || raw.includes('创作') || raw.includes('content')) {
    return BY_CODE.content;
  }
  if (raw.includes('电商') || raw.includes('ecommerce') || raw.includes('跨境')) {
    return BY_CODE.ecommerce;
  }
  if (raw.includes('教育') || raw.includes('education')) {
    return BY_CODE.education;
  }
  if (raw.includes('医疗') || raw.includes('health')) {
    return BY_CODE.healthcare;
  }
  if (raw.includes('金融') || raw.includes('finance')) {
    return BY_CODE.finance;
  }
  if (raw.includes('营销') || raw.includes('marketing')) {
    return BY_CODE.marketing;
  }
  if (raw.includes('科技') || raw.includes('软件') || raw.includes('tech')) {
    return BY_CODE.tech;
  }

  return DEFAULT_DEPTS;
}

/** 与 {@link resolveDefaultDepartments} 各行业一一对应，全部为中文部门名（展示与 AI 白名单用） */
const BY_CODE_ZH: Record<CompanyIndustryCode, string[]> = {
  tech: ['工程部', '产品部', '市场部', '销售部', '财务部', '人力资源部', '运营部'],
  content: ['编辑部', '视频部', '设计部', '发行部', '数据分析部', '人力资源部'],
  ecommerce: ['商品部', '供应链部', '客服部', '市场部', '财务部', '人力资源部'],
  consulting: ['客户部', '交付部', '商务拓展部', '财务部', '人力资源部'],
  education: ['教研部', '教学部', '学员成功部', '市场部', '人力资源部', '运营部'],
  healthcare: ['临床部', '合规部', '运营部', '患者服务部', '人力资源部', '财务部'],
  finance: ['顾问部', '风控部', '运营部', '合规部', '市场部', '人力资源部'],
  marketing: ['策略部', '创意部', '效果部', '品牌部', '数据分析部', '人力资源部'],
  other: ['工程部', '产品部', '市场部', '销售部', '财务部', '人力资源部', '运营部'],
};

const DEFAULT_DEPTS_ZH = BY_CODE_ZH.other;

/**
 * 按行业返回默认部门（全中文），与 {@link resolveDefaultDepartments} 行业判定逻辑一致。
 */
export function resolveDefaultDepartmentsZh(
  industryCode?: string | null,
  industry?: string | null,
): string[] {
  const code = (industryCode || '').trim().toLowerCase();
  if (code && (COMPANY_INDUSTRY_CODES as readonly string[]).includes(code)) {
    return [...BY_CODE_ZH[code as CompanyIndustryCode]];
  }

  const raw = `${industry || ''}`.toLowerCase();
  if (raw.includes('consult') || raw.includes('咨询')) {
    return [...BY_CODE_ZH.consulting];
  }
  if (raw.includes('内容') || raw.includes('创作') || raw.includes('content')) {
    return [...BY_CODE_ZH.content];
  }
  if (raw.includes('电商') || raw.includes('ecommerce') || raw.includes('跨境')) {
    return [...BY_CODE_ZH.ecommerce];
  }
  if (raw.includes('教育') || raw.includes('education')) {
    return [...BY_CODE_ZH.education];
  }
  if (raw.includes('医疗') || raw.includes('health')) {
    return [...BY_CODE_ZH.healthcare];
  }
  if (raw.includes('金融') || raw.includes('finance')) {
    return [...BY_CODE_ZH.finance];
  }
  if (raw.includes('营销') || raw.includes('marketing')) {
    return [...BY_CODE_ZH.marketing];
  }
  if (raw.includes('科技') || raw.includes('软件') || raw.includes('tech')) {
    return [...BY_CODE_ZH.tech];
  }

  return [...DEFAULT_DEPTS_ZH];
}
