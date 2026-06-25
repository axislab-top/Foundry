/**
 * 员工（executor）角色默认全局 skill 名 + 按部门 token 的推荐能力列表。
 * 须与 `pnpm -C apps/api run seed:global-skills` 及部门 seed 脚本一致。
 */

/** 所有部门员工 bootstrap 时至少绑定的通用 skills。 */
export const EMPLOYEE_ROLE_DEFAULT_GLOBAL_SKILL_NAMES = [
  'heartbeat',
  'employee-task-reporter',
] as const;

export type EmployeeRoleDefaultGlobalSkillName = (typeof EMPLOYEE_ROLE_DEFAULT_GLOBAL_SKILL_NAMES)[number];

/**
 * 按部门 role token 的额外技能（与商城 `recommendedSkills` 合并去重）。
 * token 与 {@link DEPARTMENT_ROLE_TOKEN_TO_ZH} 键一致。
 */
export const DEPARTMENT_EMPLOYEE_SKILL_NAMES: Record<string, readonly string[]> = {
  marketing: ['marketing-campaign-planner'],
  sales: ['sales-pipeline-manager'],
  engineering: ['code-run'],
  product: ['product-roadmap-prioritizer'],
  operations: ['operations-runbook-executor'],
  finance: ['finance-budget-tracker'],
  people: ['hr-agent-onboarding-kit'],
};

export function getDepartmentEmployeeSkillNames(departmentToken: string | null | undefined): string[] {
  const t = String(departmentToken ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!t) return [];
  const extra = DEPARTMENT_EMPLOYEE_SKILL_NAMES[t];
  return extra ? [...extra] : [];
}

export function mergeEmployeeBootstrapSkillNames(params: {
  departmentToken?: string | null;
  marketplaceRecommended?: string[] | null;
}): string[] {
  const base = [...EMPLOYEE_ROLE_DEFAULT_GLOBAL_SKILL_NAMES];
  const dept = getDepartmentEmployeeSkillNames(params.departmentToken);
  const market = Array.isArray(params.marketplaceRecommended)
    ? params.marketplaceRecommended.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  return [...new Set([...base, ...dept, ...market])];
}
