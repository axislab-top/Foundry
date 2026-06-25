/** 招聘市场 MOCK 商品目录（第一页 pageSize=200 填满） */

export type MockMarketplaceAgentRow = {
  id: string;
  slug: string;
  name: string;
  expertise: string | null;
  description: string | null;
  agentCategory: "ceo" | "department_head" | "employee";
  departmentRoles: string[];
  iconUrl: string | null;
  boundModelName: string | null;
  skillTags: string[];
  usageCount: number;
  ratingAvg: number | null;
  catalogPricing: { displayLabel: string | null; dailyPriceCents: number | null } | null;
};

const MOCK_MARKETPLACE_PAGE_SIZE = 200;

const MODELS = ["gpt-4o-mini", "gpt-4o", "deepseek-chat", "claude-sonnet-4-20250514"];

type DeptPack = {
  slug: string;
  employees: Array<{ name: string; expertise: string; tags: string[] }>;
  head: { name: string; expertise: string; tags: string[] };
};

const DEPT_PACKS: DeptPack[] = [
  {
    slug: "marketing",
    head: { name: "市场总监", expertise: "品牌营销与增长策略", tags: ["战略", "品牌"] },
    employees: [
      { name: "内容策划", expertise: "短视频脚本与选题", tags: ["内容", "短视频"] },
      { name: "短视频编导", expertise: "分镜与视觉包装", tags: ["分镜", "剪辑"] },
      { name: "品牌文案", expertise: "品牌故事与广告文案", tags: ["文案", "品牌"] },
      { name: "投放优化师", expertise: "信息流投放与 ROI 优化", tags: ["投放", "增长"] },
      { name: "社媒运营", expertise: "多平台内容分发", tags: ["社媒", "运营"] },
      { name: "SEO 专员", expertise: "搜索优化与关键词策略", tags: ["SEO", "内容"] },
    ],
  },
  {
    slug: "operations",
    head: { name: "运营总监", expertise: "用户增长与活动统筹", tags: ["增长", "活动"] },
    employees: [
      { name: "社群运营", expertise: "粉丝互动与社群维护", tags: ["社群", "互动"] },
      { name: "活动执行", expertise: "线上线下活动落地", tags: ["活动", "执行"] },
      { name: "用户运营", expertise: "留存与复购提升", tags: ["留存", "用户"] },
      { name: "数据运营", expertise: "运营指标监控与复盘", tags: ["数据", "复盘"] },
      { name: "渠道运营", expertise: "合作渠道拓展与管理", tags: ["渠道", "合作"] },
    ],
  },
  {
    slug: "finance",
    head: { name: "财务总监", expertise: "预算编制与成本门控", tags: ["预算", "合规"] },
    employees: [
      { name: "财务分析", expertise: "投放预算核算与审批材料", tags: ["分析", "预算"] },
      { name: "费用审计", expertise: "费用合规与异常预警", tags: ["审计", "合规"] },
      { name: "税务助理", expertise: "税务申报与政策解读", tags: ["税务", "合规"] },
      { name: "成本会计", expertise: "成本分摊与毛利分析", tags: ["成本", "核算"] },
    ],
  },
  {
    slug: "engineering",
    head: { name: "技术总监", expertise: "数据平台与自动化", tags: ["架构", "数据"] },
    employees: [
      { name: "数据分析师", expertise: "投放归因与 ROI 看板", tags: ["数据", "BI"] },
      { name: "后端工程师", expertise: "API 与业务系统集成", tags: ["后端", "API"] },
      { name: "前端工程师", expertise: "管理后台与数据可视化", tags: ["前端", "React"] },
      { name: "自动化工程师", expertise: "工作流与脚本自动化", tags: ["自动化", "脚本"] },
      { name: "测试工程师", expertise: "质量保障与回归测试", tags: ["测试", "QA"] },
    ],
  },
  {
    slug: "sales",
    head: { name: "销售总监", expertise: "B2B 销售体系搭建", tags: ["销售", "B2B"] },
    employees: [
      { name: "销售代表", expertise: "线索跟进与商机转化", tags: ["销售", "转化"] },
      { name: "客户成功", expertise: "续约与增购推动", tags: ["CS", "续约"] },
      { name: "商务拓展", expertise: "合作伙伴与渠道签约", tags: ["BD", "合作"] },
      { name: "售前顾问", expertise: "方案演示与需求澄清", tags: ["售前", "方案"] },
    ],
  },
  {
    slug: "product",
    head: { name: "产品总监", expertise: "产品规划与需求优先级", tags: ["产品", "规划"] },
    employees: [
      { name: "产品经理", expertise: "需求文档与迭代排期", tags: ["PRD", "迭代"] },
      { name: "用户研究员", expertise: "用户访谈与体验优化", tags: ["用研", "体验"] },
      { name: "交互设计", expertise: "原型与交互规范", tags: ["交互", "原型"] },
    ],
  },
  {
    slug: "people",
    head: { name: "人力总监", expertise: "招聘与组织发展", tags: ["HR", "组织"] },
    employees: [
      { name: "招聘专员", expertise: "简历筛选与面试协调", tags: ["招聘", "面试"] },
      { name: "培训专员", expertise: "员工培训与知识库", tags: ["培训", "知识"] },
      { name: "薪酬福利", expertise: "薪酬结构与福利政策", tags: ["薪酬", "福利"] },
    ],
  },
  {
    slug: "customer-success",
    head: { name: "客服总监", expertise: "服务质量与 SLA 管理", tags: ["客服", "SLA"] },
    employees: [
      { name: "在线客服", expertise: "工单处理与满意度提升", tags: ["客服", "工单"] },
      { name: "售后支持", expertise: "技术支持与问题闭环", tags: ["售后", "支持"] },
      { name: "投诉处理", expertise: "客诉升级与复盘改进", tags: ["客诉", "复盘"] },
    ],
  },
];

function marketplaceId(index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `a1a1a1a1-b1b1-4122-8122-${hex}`;
}

function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
  return `${base || "agent"}-${index}`;
}

function pricingFor(category: MockMarketplaceAgentRow["agentCategory"], index: number) {
  if (category === "ceo") {
    return { displayLabel: "按用量计费 · 含战略协调", dailyPriceCents: 0 };
  }
  if (category === "department_head") {
    return { displayLabel: `约 ¥${(12 + (index % 8) * 2).toFixed(0)}/日`, dailyPriceCents: (12 + (index % 8) * 2) * 100 };
  }
  const cents = 300 + (index % 15) * 80;
  return { displayLabel: `约 ¥${(cents / 100).toFixed(2)}/日`, dailyPriceCents: cents };
}

let catalogCache: MockMarketplaceAgentRow[] | null = null;

function buildCatalog(): MockMarketplaceAgentRow[] {
  const rows: MockMarketplaceAgentRow[] = [];
  let index = 0;

  rows.push({
    id: marketplaceId(index),
    slug: "ceo-strategist",
    name: "CEO 战略协调 Agent",
    expertise: "跨部门目标拆解与资源协调",
    description: "适合一人公司老板：接收指令后拆解任务、协调各部门 Agent 并行执行，并汇总交付物。",
    agentCategory: "ceo",
    departmentRoles: ["strategy"],
    iconUrl: null,
    boundModelName: "gpt-4o",
    skillTags: ["战略", "协调", "OKR"],
    usageCount: 2840,
    ratingAvg: 4.9,
    catalogPricing: pricingFor("ceo", index),
  });
  index += 1;

  rows.push({
    id: marketplaceId(index),
    slug: "ceo-ops",
    name: "CEO 运营中枢 Agent",
    expertise: "日常运营巡检与风险预警",
    description: "每日汇总各部门进度、识别阻塞项，并向老板推送待办摘要。",
    agentCategory: "ceo",
    departmentRoles: ["strategy", "operations"],
    iconUrl: null,
    boundModelName: "deepseek-chat",
    skillTags: ["巡检", "Heartbeat", "摘要"],
    usageCount: 1920,
    ratingAvg: 4.7,
    catalogPricing: pricingFor("ceo", index),
  });
  index += 1;

  for (const pack of DEPT_PACKS) {
    rows.push({
      id: marketplaceId(index),
      slug: slugify(`${pack.slug}-director`, index),
      name: `${pack.head.name} Agent`,
      expertise: pack.head.expertise,
      description: `负责${pack.slug}线目标拆解、团队协调与交付验收。适合担任部门主管岗位。`,
      agentCategory: "department_head",
      departmentRoles: [pack.slug],
      iconUrl: null,
      boundModelName: MODELS[index % MODELS.length],
      skillTags: pack.head.tags,
      usageCount: 800 + (index % 40) * 37,
      ratingAvg: 4.2 + (index % 8) * 0.1,
      catalogPricing: pricingFor("department_head", index),
    });
    index += 1;

    for (const emp of pack.employees) {
      rows.push({
        id: marketplaceId(index),
        slug: slugify(`${pack.slug}-${emp.name}`, index),
        name: `${emp.name} Agent`,
        expertise: emp.expertise,
        description: `专注${emp.expertise}，可安装到${pack.slug}相关部门空位，与主管 Agent 协同执行。`,
        agentCategory: "employee",
        departmentRoles: [pack.slug],
        iconUrl: null,
        boundModelName: MODELS[index % MODELS.length],
        skillTags: emp.tags,
        usageCount: 120 + (index % 90) * 11,
        ratingAvg: 3.8 + (index % 12) * 0.1,
        catalogPricing: pricingFor("employee", index),
      });
      index += 1;
    }
  }

  const fillerPrefixes = ["高级", "资深", "助理", "实习"];
  const fillerDomains = [
    { slug: "marketing", label: "市场" },
    { slug: "operations", label: "运营" },
    { slug: "finance", label: "财务" },
    { slug: "engineering", label: "技术" },
    { slug: "sales", label: "销售" },
    { slug: "product", label: "产品" },
  ];

  while (rows.length < MOCK_MARKETPLACE_PAGE_SIZE) {
    const domain = fillerDomains[index % fillerDomains.length];
    const prefix = fillerPrefixes[(index >> 2) % fillerPrefixes.length];
    const serial = rows.length + 1;
    const name = `${domain.label}${prefix}专员 #${serial}`;
    rows.push({
      id: marketplaceId(index),
      slug: slugify(`gen-${domain.slug}-${serial}`, index),
      name: `${name} Agent`,
      expertise: `${domain.label}执行与协作支持`,
      description: `面向${domain.label}场景的通用执行 Agent，适合补充团队人力缺口。编号 ${serial}。`,
      agentCategory: "employee",
      departmentRoles: [domain.slug],
      iconUrl: null,
      boundModelName: MODELS[index % MODELS.length],
      skillTags: [domain.label, "执行", "协作"],
      usageCount: 50 + (index % 200) * 3,
      ratingAvg: 3.5 + (index % 15) * 0.1,
      catalogPricing: pricingFor("employee", index),
    });
    index += 1;
  }

  return rows;
}

export function getMockMarketplaceCatalog(): MockMarketplaceAgentRow[] {
  if (!catalogCache) {
    catalogCache = buildCatalog();
  }
  return catalogCache;
}

export function queryMockMarketplaceAgents(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params?.pageSize ?? MOCK_MARKETPLACE_PAGE_SIZE));
  const search = params?.search?.trim().toLowerCase();

  let items = getMockMarketplaceCatalog();
  if (search) {
    items = items.filter((row) => {
      const hay = [
        row.name,
        row.slug,
        row.description ?? "",
        row.expertise ?? "",
        ...row.skillTags,
        ...row.departmentRoles,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    items: pageItems,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function findMockMarketplaceAgentById(id: string): MockMarketplaceAgentRow | null {
  return getMockMarketplaceCatalog().find((row) => row.id === id) ?? null;
}
