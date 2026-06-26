/**
 * L2 编排前置：在「组织已有部门 slug」集合上解析本轮可指派池；意图 slug 仅作 hint / 可选收窄。
 */

export type AssignableDepartmentPolicy = 'org_only' | 'intent_filter';

export const DEFAULT_FALLBACK_DEPARTMENT_SLUG = 'project-management';

export interface ResolveAssignableDepartmentSlugsParams {
  orgSlugs: string[];
  intentSlugs: string[];
  policy: AssignableDepartmentPolicy;
}

export interface ResolveAssignableDepartmentSlugsResult {
  assignableDepartmentSlugs: string[];
  /** 意图里且存在于组织中的 slug（有序去重） */
  intentDepartmentHints: string[];
  /** 意图里但组织不存在的 slug */
  droppedIntentSlugs: string[];
  assignableResolvePolicy: AssignableDepartmentPolicy;
  /** org 为空时使用兜底 */
  usedEmptyOrgFallback: boolean;
}

function normalizeOrgSlugs(orgSlugs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of orgSlugs) {
    const s = String(raw ?? '').trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * @param intentSlugs — 通常为 intent.targetDepartmentSlugs；会先过滤到仅保留 org 内存在的 slug。
 */
export function resolveAssignableDepartmentSlugs(params: ResolveAssignableDepartmentSlugsParams): ResolveAssignableDepartmentSlugsResult {
  const orgList = normalizeOrgSlugs(params.orgSlugs);
  const orgSet = new Set(orgList);

  const intentRaw = params.intentSlugs.map((s) => String(s ?? '').trim()).filter(Boolean);
  const intentDepartmentHints: string[] = [];
  const hintSeen = new Set<string>();
  for (const s of intentRaw) {
    const norm = String(s ?? '').trim().toLowerCase();
    if (!norm || !orgSet.has(norm)) continue;
    if (hintSeen.has(norm)) continue;
    hintSeen.add(norm);
    intentDepartmentHints.push(norm);
  }
  const droppedIntentSlugs = intentRaw.filter((s) => !orgSet.has(String(s ?? '').trim().toLowerCase()));

  if (orgList.length === 0) {
    return {
      assignableDepartmentSlugs: [DEFAULT_FALLBACK_DEPARTMENT_SLUG],
      intentDepartmentHints: [],
      droppedIntentSlugs: intentRaw,
      assignableResolvePolicy: params.policy,
      usedEmptyOrgFallback: true,
    };
  }

  let assignableDepartmentSlugs: string[];
  if (params.policy === 'intent_filter' && intentDepartmentHints.length > 0) {
    assignableDepartmentSlugs = intentDepartmentHints.slice(0, 24);
  } else {
    assignableDepartmentSlugs = orgList;
  }

  return {
    assignableDepartmentSlugs,
    intentDepartmentHints,
    droppedIntentSlugs,
    assignableResolvePolicy: params.policy,
    usedEmptyOrgFallback: false,
  };
}
