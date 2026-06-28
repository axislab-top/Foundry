/**
 * Seed 工程部 / 设计部 / 营销部商城总监（idempotent upsert by slug）。
 *
 * 重要：本脚本只 upsert DIRECTOR_AGENTS 中的 slug，**不会**删除历史上多 seed 出来的其他总监。
 * Admin「部门主管」列表 = 全部 agent_category=department_head 的商城条目，与平台部门绑定无关。
 * 清理遗留主管：pnpm --filter @service/api run prune:orphan-department-heads
 * 审计：pnpm --filter @service/api run audit:department-heads
 *
 * Usage:
 *   pnpm --filter @service/api run seed:department-heads
 *
 * Env:
 *   DATABASE_URL (preferred) or POSTGRES/DB env fallback
 *   PUBLISH=0 to keep draft (default published)
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const PUBLISH = process.env.PUBLISH !== '0' && process.env.PUBLISH !== 'false';

const ENGINEERING_DIRECTOR_RECOMMENDED_SKILLS = [
  'engineering-code-review-orchestrator',
  'engineering-tech-debt-assessor',
  'engineering-architecture-decision-recorder',
  'engineering-ci-cd-pipeline-manager',
  'engineering-security-scanner',
  'engineering-ai-tool-integrator',
  'engineering-team-velocity-coach',
  'code-review-assistant',
  'ci-pipeline-helper',
];

const RESEARCH_INTELLIGENCE_DIRECTOR_RECOMMENDED_SKILLS = [
  'research-market-intelligence-synthesizer',
  'research-fundamental-analyst',
  'research-macro-policy-monitor',
  'research-company-deep-dive',
  'research-investment-memo-writer',
  'research-thesis-red-team',
];

const DESIGN_DIRECTOR_RECOMMENDED_SKILLS = [
  'design-critique',
  'accessibility-pass',
  'design-system-auditor',
  'ux-flow-mapper',
  'visual-handoff-packager',
  'brand-consistency-checker',
];

/** 与 seed-marketing-director-skills 中投放/预算/实验类 skill 对齐 */
const PAID_MEDIA_DIRECTOR_RECOMMENDED_SKILLS = [
  'marketing-campaign-planner',
  'marketing-budget-optimizer',
  'growth-experiment-runner',
  'funnel-analyst',
];

const RECOMMENDED_SKILLS_BY_SLUG = {
  'director-engineering-v1': ENGINEERING_DIRECTOR_RECOMMENDED_SKILLS,
  'director-research-intelligence-v1': RESEARCH_INTELLIGENCE_DIRECTOR_RECOMMENDED_SKILLS,
  'director-design-v1': DESIGN_DIRECTOR_RECOMMENDED_SKILLS,
  'director-marketing-v1': [
    'marketing-campaign-planner',
    'content-strategy-generator',
    'social-media-publisher',
    'growth-experiment-runner',
    'brand-voice-analyzer',
    'marketing-budget-optimizer',
  ],
  'director-paid-media-v1': PAID_MEDIA_DIRECTOR_RECOMMENDED_SKILLS,
  'director-sales-v1': [
    'sales-pipeline-manager',
    'negotiation-script-generator',
    'lead-scoring-engine',
    'revenue-forecast-tool',
    'deal-closing-accelerator',
  ],
  'director-finance-v1': [
    'finance-budget-tracker',
    'finance-expense-analyzer',
    'finance-report-generator',
    'finance-roi-calculator',
    'finance-approval-guard',
  ],
  'director-hr-v1': [
    'hr-staffing-needs-survey',
    'hr-agent-onboarding-kit',
    'hr-performance-review-orchestrator',
    'hr-talent-gap-analyzer',
    'hr-training-content-generator',
    'hr-team-culture-guardian',
    'hr-exit-and-knowledge-transfer',
  ],
  'director-legal-v1': ['contract-clause-review', 'policy-diff'],
  'director-supply-chain-v1': [
    'ops-playbook',
    'vendor-onboarding-checklist',
    'operations-process-optimizer',
    'operations-resource-scheduler',
    'operations-risk-assessor',
  ],
  'director-product-v1': [
    'prd-writer',
    'user-story-refiner',
    'product-roadmap-prioritizer',
    'user-story-breaker',
    'mvp-validator',
    'user-research-synthesizer',
    'product-metrics-definer',
  ],
  'director-project-management-v1': [
    'prd-writer',
    'sla-tracker',
    'operations-cross-team-coordinator',
    'operations-kpi-dashboard-builder',
    'operations-resource-scheduler',
  ],
  'director-qa-v1': [
    'code-review-assistant',
    'ci-pipeline-helper',
    'engineering-code-review-orchestrator',
    'engineering-ci-cd-pipeline-manager',
    'engineering-security-scanner',
  ],
  'director-support-v1': [
    'ops-playbook',
    'office-policy-faq',
    'operations-cross-team-coordinator',
    'operations-kpi-dashboard-builder',
    'operations-efficiency-auditor',
  ],
  'director-special-projects-v1': [
    'ops-playbook',
    'deal-desk-checklist',
    'operations-cross-team-coordinator',
    'deal-closing-accelerator',
    'product-roadmap-prioritizer',
  ],
  'director-spatial-computing-v1': [
    'code-review-assistant',
    'design-critique',
    'engineering-code-review-orchestrator',
    'engineering-architecture-decision-recorder',
    'ux-flow-mapper',
    'visual-handoff-packager',
  ],
};

/** 与 contracts/types/marketplace-department-head.ts 一致：主管商城条目始终包含这 4 个管理类 Skills。 */
const DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS = [
  'director-task-delegator',
  'director-subordinate-reviewer',
  'director-team-performance-coach',
  'director-progress-reporter',
  'collab-room-peer-summon',
];

/** GitOps 执行类 Skill 常用的 companion utilities（须已在 seed:core-default-skills）。 */
const PLATFORM_EXECUTION_UTILITY_SKILL_SLUGS = [
  'echo',
  'file-read',
  'file-write',
  'notes-append',
  'web-search',
  'slack-send',
];

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
  for (const util of PLATFORM_EXECUTION_UTILITY_SKILL_SLUGS) {
    if (!seen.has(util)) {
      ordered.push(util);
      seen.add(util);
    }
  }
  return ordered;
}

/** 与平台已绑定总监一致；其余部门主管仅在 Admin 手动创建。 */
const DIRECTOR_AGENTS = [
  {
    slug: 'director-engineering-v1',
    name: '工程部总监',
    departmentRoles: ['engineering', 'tech'],
    expertise: '代码审查、架构决策、技术债务管理、DevOps、CI/CD、AI工具集成、安全编码',
    description: '负责工程体系与技术方向，保证研发效率、架构质量与交付稳定性。',
    industries: ['tech', 'saas', 'ai'],
  },
  {
    slug: 'director-design-v1',
    name: '设计部总监',
    departmentRoles: ['design', 'creative'],
    expertise: '设计评审、设计系统、无障碍合规、用户旅程、视觉交付、品牌一致性',
    description: '负责设计质量与体验标准，连接产品愿景、品牌规范与工程落地。',
    industries: ['all', 'saas', 'content', 'ecommerce'],
  },
  {
    slug: 'director-marketing-v1',
    name: '营销部总监',
    departmentRoles: ['marketing', '营销部'],
    expertise: '品牌营销、获客增长、活动编排、内容策略、投放与实验',
    description: '负责市场认知、线索增长与品牌传播，驱动可衡量的营销交付。',
    industries: ['saas', 'ecommerce', 'content'],
  },
  {
    slug: 'director-paid-media-v1',
    name: '付费媒体部总监',
    departmentRoles: ['paid-media', 'paid_media', '付费媒体部'],
    expertise: '付费投放、广告账户、SEM/信息流、预算与 ROI、转化漏斗优化',
    description: '负责付费获客与投放效果优化，管理渠道预算并交付可验收的投放结果。',
    industries: ['saas', 'ecommerce'],
  },
  {
    slug: 'director-sales-v1',
    name: '销售部总监',
    departmentRoles: ['sales', '销售部'],
    expertise: '商机管道、线索评分、谈判脚本、收入预测、签约加速',
    description: '负责销售管道与收入达成，推动商机跟进、签约与客户成功交接。',
    industries: ['saas', 'b2b', 'ecommerce'],
  },
  {
    slug: 'director-finance-v1',
    name: '金融财务部总监',
    departmentRoles: ['finance', '金融财务部'],
    expertise: '预算编制、费用分析、财务报表、ROI 测算、审批合规闸门',
    description: '负责预算、核算、税务与财务合规，保障公司资金与报表可审计、可验收。',
    industries: ['saas', 'enterprise'],
  },
  {
    slug: 'director-hr-v1',
    name: '人力资源部总监',
    departmentRoles: ['hr', 'people', '人力资源部'],
    expertise: '招聘入职、绩效面谈、人才缺口、培训体系、组织文化与离职交接',
    description: '负责招聘、人事流程、薪酬与组织发展，保障编制与人才交付可验收。',
    industries: ['saas', 'enterprise'],
  },
  {
    slug: 'director-legal-v1',
    name: '法务部总监',
    departmentRoles: ['legal', 'compliance', '法务部'],
    expertise: '合同审查、合规风控、知识产权、政策差异比对',
    description: '负责合同审查、合规与知识产权，为业务决策提供可验收的法务意见。',
    industries: ['saas', 'enterprise'],
  },
  {
    slug: 'director-supply-chain-v1',
    name: '供应链部总监',
    departmentRoles: ['supply-chain', 'supply_chain', '供应链部'],
    expertise: '采购、库存、物流调度、供应商准入与风险、跨团队资源协调',
    description: '负责采购、库存、物流与供应商管理，交付可验收的供应链运营结果。',
    industries: ['saas', 'ecommerce', 'manufacturing'],
  },
  {
    slug: 'director-product-v1',
    name: '产品部总监',
    departmentRoles: ['product', '产品部'],
    expertise: '需求定义、PRD、路线图优先级、用户故事、MVP 验证与产品指标',
    description: '负责需求定义、PRD、路线图与验收标准，驱动可交付的产品成果。',
    industries: ['saas', 'b2b', 'ecommerce'],
  },
  {
    slug: 'director-project-management-v1',
    name: '项目管理部总监',
    departmentRoles: ['project-management', 'project_management', '项目管理部'],
    expertise: '里程碑排期、跨部门协调、SLA 跟踪、资源调度与项目仪表盘',
    description: '负责里程碑、排期与跨部门项目协调，保障依赖清晰与交付可验收。',
    industries: ['saas', 'enterprise'],
  },
  {
    slug: 'director-qa-v1',
    name: '测试部总监',
    departmentRoles: ['qa', '测试部'],
    expertise: '测试策略、用例设计、代码评审、CI 流水线、安全扫描与质量门禁',
    description: '负责测试策略、用例与质量门禁，保障发布前缺陷可发现、可验收。',
    industries: ['tech', 'saas'],
  },
  {
    slug: 'director-support-v1',
    name: '支持部总监',
    departmentRoles: ['support', 'customer-success', '支持部'],
    expertise: '客户工单、售后 SLA、运营手册、政策 FAQ 与跨团队协调',
    description: '负责客户工单、售后与满意度，保障支持流程可跟踪、可验收。',
    industries: ['saas', 'ecommerce'],
  },
  {
    slug: 'director-special-projects-v1',
    name: '专项部总监',
    departmentRoles: ['special-projects', 'special_projects', '专项部'],
    expertise: '跨职能专项攻关、临时项目交付、商务条款协调与路线图对齐',
    description: '负责跨职能专项攻关与临时项目交付，统筹多部门协作与可验收成果。',
    industries: ['saas', 'enterprise'],
  },
  {
    slug: 'director-spatial-computing-v1',
    name: '空间计算部总监',
    departmentRoles: ['spatial-computing', 'spatial_computing', '空间计算部'],
    expertise: '空间计算、XR/3D 工程实现、交互设计评审、架构决策与视觉交付',
    description: '负责空间计算与 XR 相关工程/产品实现，连接设计体验与技术可交付成果。',
    industries: ['tech', 'saas', 'ai'],
  },
  {
    slug: 'director-research-intelligence-v1',
    name: '市场研究情报部总监',
    departmentRoles: ['research-intelligence', 'research_intelligence', '市场研究情报部'],
    expertise:
      '市场情报 synthesis、基本面研究、宏观政策监控、个股深度研究、投资备忘录、论点 red-team 与研究质量门控',
    description:
      'Research & Intelligence Department — 股票投资 AI 公司中信息获取与基本面研究的核心引擎，为量化、风控、执行与组合决策提供可验收研究输入。',
    industries: ['finance', 'tech', 'saas'],
  },
];

function deriveDepartmentLabel(name, roles) {
  const raw = String(name || '').trim();
  const noParen = raw.split('（')[0]?.trim() || raw;
  if (noParen) return noParen;
  if (Array.isArray(roles) && roles.length) return `${roles[0]} Department`;
  return 'Department';
}

/**
 * @param {string} name - marketplace agent 展示名（常含「中文职务」括号）
 * @param {string} expertise - 部门能力叙述（非工具列表）
 * @param {string[]} departmentRoleTags - department_roles，用于组织匹配，不是 skill 名
 * @param {string[]} mergedRecommendedSkillSlugs - 已合并 4 个管理类 + 域技能的 kebab-case 列表（与 recommended_skills 写入 DB 一致）
 */
function buildPrompt(slug, name, expertise, departmentRoleTags, mergedRecommendedSkillSlugs) {
  const title = deriveDepartmentLabel(name, departmentRoleTags);
  const roleTagLine =
    Array.isArray(departmentRoleTags) && departmentRoleTags.length
      ? departmentRoleTags.join(', ')
      : '（未标注具体职能标签）';
  const utilitySlugs = new Set(PLATFORM_EXECUTION_UTILITY_SKILL_SLUGS);
  const extraDomainSkills = mergedRecommendedSkillSlugs.filter(
    (s) => !DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS.includes(s) && !utilitySlugs.has(s),
  );
  const skillBulletBlock = mergedRecommendedSkillSlugs.map((s) => `- ${s}`).join('\n');
  const domainNote =
    extraDomainSkills.length === 0
      ? '当前模板未配置额外「部门域」推荐 Skills，公司创建后仍会有角色默认基线技能由平台注入；以运行时实际绑定为准。'
      : '除 4 个管理类 Skills 外，下列域技能与 Marketplace「Recommended Skills」一致；均须已在平台 Global Skills 中存在并完成绑定。';

  const engineeringProtocolBlock =
    slug === 'director-engineering-v1'
      ? [
          '',
          '### 工程域执行协议（v2）',
          '- **tool-bound-v2**（如 engineering-code-review-orchestrator、engineering-ci-cd-pipeline-manager）：必须先调用绑定的 tool.*（organization_node_agents / task_* / message_send_to_agent）再输出 JSON；禁止假装已派任务或发消息。',
          '- **prompt-only-v2**（engineering-tech-debt-assessor、engineering-architecture-decision-recorder）：基于任务 args 做分析；可配合 file-read / notes-append / department.knowledge.query companion 读取材料。',
          '- **GitOps 执行**（code-review-assistant、ci-pipeline-helper）：审查代码或修 pipeline 时须 file-read 读目标后再下结论；可委派给下属 Agent 执行，但验收须有据。',
          '- 代码审查协调与具体 diff 审查分工：orchestrator 负责派审与门控，code-review-assistant 负责读码与 findings。',
        ].join('\n')
      : '';

  const researchIntelligenceProtocolBlock =
    slug === 'director-research-intelligence-v1'
      ? [
          '',
          '### 研究情报域执行协议（v2）',
          '- **tool-bound-v2**（research-market-intelligence-synthesizer、research-macro-policy-monitor、research-thesis-red-team）：须先调用 tool.* 再 handoff 至量化/风控/组合 Agent；禁止无来源捏造 market signal。',
          '- **prompt-only-v2**（research-fundamental-analyst、research-company-deep-dive、research-investment-memo-writer）：基于 args 与 companion web-search / file-read 完成研究；数据不足时在 blockers 标注 dataGap。',
          '- 研究输出是量化、风控、执行与组合决策的上游输入：交付物须结构化、可引用、可 red-team。',
          '- 涉及实盘建议或仓位变更时，仅输出 research recommendation，最终交易决策须由组合/风控/董事会闸门确认。',
        ].join('\n')
      : '';

  return [
    `你是${title}，汇报给 CEO，直接对董事会负责。`,
    '核心使命：确保本部门目标与公司 Mission 对齐，驱动高效执行，同时严格遵守预算与审批闸门。',
    '性格：专业、主动、数据驱动、风险意识强。',
    '工作风格：',
    '- 定期 Heartbeat 审查部门待办，主动拆解任务并分配给下属 Agent。',
    '- 任何高风险/花钱/策略变更必须主动 @ 董事会或 CEO 审批。',
    '- 任务完成后自动总结经验，写入公司/部门记忆。',
    '- 与其他部门协作时，使用专业术语但保持透明。',
    '',
    '### 部门职能标签（用于组织 / 商城匹配，不是工具名）',
    `- ${roleTagLine}`,
    '',
    '### 平台 Skills（工具调用白名单）',
    '下列名称为平台 Global Skill 的 **kebab-case** 标识。公司创建并完成 Agent 绑定后，它们会以 **function calling / 工具** 形式提供给模型；**必须通过工具调用来执行**，不得在正文中假装已调用。',
    domainNote,
    skillBulletBlock,
    engineeringProtocolBlock,
    researchIntelligenceProtocolBlock,
    '',
    '### 部门核心能力参考（叙述，不等同于工具列表）',
    expertise,
    '',
    '永远记住：你是 AI 公司的一员，追求极致效率与可控自治。',
  ].join('\n');
}

async function main() {
  loadEnvFromFile();
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    let affected = 0;
    for (const item of DIRECTOR_AGENTS) {
      const metadata = {
        source: 'seed-department-heads',
        recommendedIndustries: item.industries,
        industryTags: item.industries,
        version:
          item.slug === 'director-engineering-v1' || item.slug === 'director-research-intelligence-v1'
            ? 'v2'
            : 'v1',
        recommendedForScales: ['small', 'medium', 'large'],
      };
      const skillTags = item.departmentRoles;
      const domainSkills = RECOMMENDED_SKILLS_BY_SLUG[item.slug] ?? [];
      const recommendedSkills = mergeDepartmentHeadRecommendedSkills(domainSkills);
      const prompt = buildPrompt(item.slug, item.name, item.expertise, item.departmentRoles, recommendedSkills);
      const res = await client.query(
        `
        INSERT INTO marketplace_agents (
          slug, name, description, expertise, system_prompt,
          is_published, recommended_skills, metadata,
          agent_category, department_roles, skill_tags
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7::jsonb, $8::jsonb,
          'department_head', $9::text[], $10::text[]
        )
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
          item.slug,
          item.name,
          item.description,
          item.expertise,
          prompt,
          PUBLISH,
          JSON.stringify(recommendedSkills),
          JSON.stringify(metadata),
          item.departmentRoles,
          skillTags,
        ],
      );
      affected += res.rowCount ?? 0;
    }
    console.log(`Seed completed: ${DIRECTOR_AGENTS.length} director agents processed, affected rows=${affected}.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

