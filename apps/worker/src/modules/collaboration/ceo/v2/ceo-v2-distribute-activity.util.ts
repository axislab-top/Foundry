import type { PlanningResult } from '@contracts/types';

/** Temporal `distributeActivityV2` 入参：兼容仅传 `PlanningResult` 的旧形状。 */
export type CeoV2DistributeActivityData =
  | PlanningResult
  | {
      planning: PlanningResult;
      intentDepartmentSlugs?: string[];
    };

export function normalizeCeoV2DistributeActivityData(data: CeoV2DistributeActivityData): {
  planning: PlanningResult;
  intentDepartmentSlugs: string[];
} {
  if (data && typeof data === 'object' && 'planning' in data && data.planning) {
    const wrapped = data as { planning: PlanningResult; intentDepartmentSlugs?: unknown };
    const intentDepartmentSlugs = Array.isArray(wrapped.intentDepartmentSlugs)
      ? wrapped.intentDepartmentSlugs.map((s) => String(s ?? '').trim()).filter(Boolean)
      : [];
    return { planning: wrapped.planning, intentDepartmentSlugs };
  }
  return { planning: data as PlanningResult, intentDepartmentSlugs: [] };
}
