/**
 * 与 OrganizationService 组织树缓存版本键保持一致，
 * 便于任务「按部门筛选」等派生缓存随结构变更失效。
 */
export function getOrgTreeVersionCacheKey(companyId: string): string {
  return `company:${companyId}:org-tree:version`;
}

/** 某公司某版本下，某部门节点的子树组织 id 列表（JSON: { subIds }） */
export function getTaskDeptSubtreeCacheKey(
  companyId: string,
  treeVersion: number,
  departmentNodeId: string,
): string {
  return `company:${companyId}:tasks:dept-subtree:v${treeVersion}:dept:${departmentNodeId}`;
}
