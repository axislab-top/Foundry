import type { DepartmentCapability } from '@contracts/types';
import {
  classifyPhaseTaskTypes,
  scoreDepartmentForPhase,
  type ScoreDepartmentForPhaseResult,
} from '@foundry/contracts/types/department-assignment';

export { classifyPhaseTaskTypes, scoreDepartmentForPhase };
export type { DepartmentCapability, ScoreDepartmentForPhaseResult };

export function readDepartmentCapabilitiesFromPlanningMetadata(
  metadata: Record<string, unknown> | undefined,
): DepartmentCapability[] {
  const raw = metadata?.departmentCapabilities;
  if (!Array.isArray(raw)) return [];
  const out: DepartmentCapability[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const slug = String(o.slug ?? '').trim();
    if (!slug) continue;
    const tags = Array.isArray(o.taskTypeTags)
      ? (o.taskTypeTags as unknown[]).map((t) => String(t ?? '').trim()).filter(Boolean)
      : [];
    out.push({
      slug,
      name: String(o.name ?? slug).trim() || slug,
      organizationNodeId: typeof o.organizationNodeId === 'string' ? o.organizationNodeId : undefined,
      platformDepartmentSlug:
        typeof o.platformDepartmentSlug === 'string' ? o.platformDepartmentSlug : undefined,
      responsibilitySummary:
        typeof o.responsibilitySummary === 'string' ? o.responsibilitySummary : undefined,
      taskTypeTags: tags,
      excludesTaskTypeTags: Array.isArray(o.excludesTaskTypeTags)
        ? (o.excludesTaskTypeTags as unknown[]).map((t) => String(t ?? '').trim()).filter(Boolean)
        : undefined,
      capabilitiesSource:
        typeof o.capabilitiesSource === 'string'
          ? (o.capabilitiesSource as DepartmentCapability['capabilitiesSource'])
          : undefined,
    });
  }
  return out;
}

export function pickDepartmentForPhaseWithCapabilities(params: {
  title: string;
  outcome: string;
  candidates: DepartmentCapability[];
  fallbackPick: (title: string, outcome: string, slugList: string[]) => string;
}): { department: string; method: 'capability_tags' | 'slug_heuristic_fallback'; score?: number } {
  const pool = params.candidates.filter((c) => c.taskTypeTags.length > 0 || c.responsibilitySummary);
  if (!pool.length) {
    const slugs = params.candidates.map((c) => c.slug);
    return {
      department: params.fallbackPick(params.title, params.outcome, slugs),
      method: 'slug_heuristic_fallback',
    };
  }
  const phaseTypes = classifyPhaseTaskTypes(params.title, params.outcome);
  const scored = scoreDepartmentForPhase({
    phaseTaskTypes: phaseTypes,
    candidates: pool,
    fallbackSlug: pool[0]?.slug,
  });
  return { department: scored.department, method: 'capability_tags', score: scored.score };
}
