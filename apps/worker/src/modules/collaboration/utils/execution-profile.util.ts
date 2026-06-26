/** 部门任务执行形态（L2 下发 metadata.executionProfile）。 */
export type ExecutionProfile = 'solo_director' | 'director_delegates' | 'employee';

export function resolveExecutionProfile(params: {
  assigneeRole?: string | null;
  departmentEmployeeCount?: number | null;
}): ExecutionProfile {
  const role = String(params.assigneeRole ?? '').trim().toLowerCase();
  if (role === 'executor' || role === 'employee') {
    return 'employee';
  }
  const count = params.departmentEmployeeCount;
  if (typeof count === 'number' && Number.isFinite(count)) {
    return count <= 0 ? 'solo_director' : 'director_delegates';
  }
  return 'director_delegates';
}

/** solo_director 禁止走总监派工 Skill，须选交付型 Skill。 */
export function soloDirectorMustUseDeliverableSkill(profile: ExecutionProfile): boolean {
  return profile === 'solo_director';
}
