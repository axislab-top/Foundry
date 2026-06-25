/**
 * 部门主管（商城 Agent）与创建公司向导共用的约定：
 * - 商城 `recommended_skills` 用 {@link mergeDepartmentHeadRecommendedSkills} 合并 4 个管理类 skills（打头、去重）。
 * - 租户内 `role=director` 的 Agent 默认绑定哪些全局 skill 名：见 API
 *   `getDefaultGlobalSkillNamesForRole('director')`（代码内置 {@link DIRECTOR_ROLE_DEFAULT_GLOBAL_SKILL_NAMES}），
 *   且可被平台 `platform_settings.skills.defaultGlobalNamesByRole` 覆盖。
 * - departmentRoles 中的 token 会通过 DEPARTMENT_ROLE_TOKEN_TO_ZH 映射为中文部门名（与 API 推荐白名单一致）。
 * - 标准部门 token 优先来自 `@foundry/contracts`（PLATFORM_DEPARTMENTS）；以下为历史/行业扩展别名。
 */

import { buildDepartmentTokenToZhMap } from '@foundry/contracts/types/departments';

/** 未纳入 PLATFORM_DEPARTMENTS 的历史别名（保持向后兼容） */
const LEGACY_DEPARTMENT_ROLE_TOKEN_TO_ZH: Record<string, string> = {
  operation: '运营部',
  support: '支持部',
  customer_success: '客户成功部',
  customer: '客户服务部',
  people: '人力资源部',
  compliance: '合规部',
  analytics: '数据分析部',
  research: '研究部',
  rd: '研发部',
  'r&d': '研发部',
  qa: '质量保障部',
  devops: '平台运维部',
  video: '视频部',
  distribution: '发行部',
  merchandising: '商品部',
  supply_chain: '供应链部',
  customer_service: '客服部',
  client_services: '客户部',
  delivery: '交付部',
  curriculum: '教研部',
  instruction: '教学部',
  student_success: '学员成功部',
  clinical: '临床部',
  patient_services: '患者服务部',
  advisory: '顾问部',
  risk: '风控部',
  strategy: '策略部',
  performance: '效果部',
  brand: '品牌部',
};

/** 英文 role key / token → 中文部门名：以 PLATFORM_DEPARTMENTS 为权威，合并历史别名 */
export const DEPARTMENT_ROLE_TOKEN_TO_ZH: Record<string, string> = {
  ...LEGACY_DEPARTMENT_ROLE_TOKEN_TO_ZH,
  ...buildDepartmentTokenToZhMap(),
};

export const DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS = [
  'director-task-delegator',
  'director-subordinate-reviewer',
  'director-team-performance-coach',
  'director-progress-reporter',
  'collab-room-peer-summon',
] as const;

/**
 * 全局 `skills.name` 有序列表：无 DB 覆盖时，作为 `director` 角色默认绑定的全局 skills。
 * 须与 `pnpm -C apps/api run seed:global-skills` 所 seed 的条目一致。
 */
export const DIRECTOR_ROLE_DEFAULT_GLOBAL_SKILL_NAMES = [
  'director-task-delegator',
  'director-progress-reporter',
  'director-subordinate-reviewer',
  'department.knowledge.query',
  'director-team-performance-coach',
] as const;

export type DirectorRoleDefaultGlobalSkillName = (typeof DIRECTOR_ROLE_DEFAULT_GLOBAL_SKILL_NAMES)[number];

export const DEPARTMENT_HEAD_ROLE_SELECT_OPTIONS = Object.entries(DEPARTMENT_ROLE_TOKEN_TO_ZH)
  .map(([value, labelZh]) => ({ value, labelZh }))
  .sort((a, b) => a.labelZh.localeCompare(b.labelZh, 'zh-Hans-CN'));

/**
 * 部门主管商城条目：合并 4 个管理 skills（去重，管理 skills 始终在前）。
 */
export function mergeDepartmentHeadRecommendedSkills(existing: string[] | null | undefined): string[] {
  const ordered: string[] = [...DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS];
  const seen = new Set<string>(ordered);
  for (const x of existing ?? []) {
    const t = typeof x === 'string' ? x.trim() : '';
    if (t && !seen.has(t)) {
      ordered.push(t);
      seen.add(t);
    }
  }
  return ordered;
}

/** 取消部门主管绑定时移除平台自动合并的 4 个管理 skills（其它推荐 skills 保留） */
export function stripDepartmentHeadManagementSkills(existing: string[] | null | undefined): string[] {
  const drop = new Set<string>(DEFAULT_DEPARTMENT_HEAD_MANAGEMENT_SKILL_SLUGS);
  return (existing ?? [])
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((t) => t && !drop.has(t));
}

/**
 * 从已上架、标记为部门主管的商城 Agent 推导可选中文部门名（与 API extractAllowedDepartmentsFromHeads 对齐，不含服务端 config 覆盖）。
 */
export function departmentsFromPublishedHeadAgents(
  agents: Array<{ isPublished?: boolean; agentCategory?: 'ceo' | 'department_head' | 'employee'; departmentRoles?: string[] | null }>,
  zhMap: Record<string, string> = DEPARTMENT_ROLE_TOKEN_TO_ZH,
): string[] {
  const out = new Set<string>();
  for (const a of agents) {
    if (a.isPublished === false || a.agentCategory !== 'department_head') continue;
    const roles = Array.isArray(a.departmentRoles) ? a.departmentRoles : [];
    for (const role of roles) {
      const s = String(role || '').trim();
      if (!s) continue;
      const key = s.toLowerCase().replace(/\s+/g, '_');
      out.add(zhMap[key] ?? s);
    }
  }
  return [...out];
}
