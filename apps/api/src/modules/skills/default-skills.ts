import {
  DIRECTOR_ROLE_DEFAULT_GLOBAL_SKILL_NAMES,
  EMPLOYEE_ROLE_DEFAULT_GLOBAL_SKILL_NAMES,
  getDepartmentEmployeeSkillNames,
  mergeEmployeeBootstrapSkillNames,
} from '@contracts/types';

/** Roles that have a built-in default global skill name list (used for admin UI + platform overrides). */
export const KNOWN_ROLES_WITH_DEFAULT_GLOBAL_SKILLS = [
  'ceo',
  'director',
  'board_member',
  'executor',
] as const;

/**
 * 代码内置默认全局 skill `name` 列表（`platform_settings.skills.defaultGlobalNamesByRole` 可整键覆盖）。
 */
export function getDefaultGlobalSkillNamesForRole(
  role: string,
  options?: { departmentToken?: string | null; marketplaceRecommended?: string[] | null },
): string[] {
  const r = String(role ?? '').trim();
  if (r === 'director') {
    return [...DIRECTOR_ROLE_DEFAULT_GLOBAL_SKILL_NAMES];
  }
  if (r === 'executor') {
    return mergeEmployeeBootstrapSkillNames({
      departmentToken: options?.departmentToken,
      marketplaceRecommended: options?.marketplaceRecommended,
    });
  }
  if (r === 'executor_base_only') {
    return [...EMPLOYEE_ROLE_DEFAULT_GLOBAL_SKILL_NAMES];
  }
  return [];
}

export { getDepartmentEmployeeSkillNames, mergeEmployeeBootstrapSkillNames };
