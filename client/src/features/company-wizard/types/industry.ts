export const COMPANY_INDUSTRY_PRESETS = [
  { code: "tech", labelZh: "科技", emoji: "🖥" },
  { code: "content", labelZh: "内容创作", emoji: "✍️" },
  { code: "ecommerce", labelZh: "电商", emoji: "🛒" },
  { code: "consulting", labelZh: "咨询服务", emoji: "💼" },
  { code: "education", labelZh: "教育", emoji: "🎓" },
  { code: "healthcare", labelZh: "医疗", emoji: "🏥" },
  { code: "finance", labelZh: "金融", emoji: "💰" },
  { code: "marketing", labelZh: "营销", emoji: "📣" },
  { code: "other", labelZh: "其他", emoji: "⚙️" },
] as const;

export type CompanyIndustryCode = (typeof COMPANY_INDUSTRY_PRESETS)[number]["code"];

export const COMPANY_SCALE_OPTIONS: Array<{ value: "small" | "medium" | "large"; label: string; hint: string }> = [
  { value: "small", label: "小型", hint: "1–5 人团队" },
  { value: "medium", label: "中型", hint: "6–20 人团队" },
  { value: "large", label: "大型", hint: "20+ 人团队" },
];
