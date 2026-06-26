/**
 * L1 Strategy 前的记忆检索与规划画像。
 * 默认 `company`（协同交付蓝图）；`task_publish` / 文档类关键词可走 `deliverable` 轻量分支（Phase 4）。
 */

export type StrategyPlanningProfile = 'company' | 'deliverable';

export type StrategyPlanningProfileMode = 'unified' | 'deliverable_bias';

const DELIVERABLE_CONTENT_RE =
  /文档|白皮书|PRD|需求说明|撰写|起草|报告|方案|说明书|task_publish|可行性|调研报告/i;

/** 按消息类别与正文解析 Strategy 规划画像（单一真源）。 */
export function resolveStrategyPlanningProfile(params: {
  messageCategory?: string | null;
  contentText?: string | null;
  mode?: StrategyPlanningProfileMode;
}): StrategyPlanningProfile {
  if (params.mode === 'unified') return 'company';
  const cat = String(params.messageCategory ?? '').trim();
  if (cat === 'task_publish') return 'deliverable';
  const text = String(params.contentText ?? '').trim();
  if (text && DELIVERABLE_CONTENT_RE.test(text)) return 'deliverable';
  return 'company';
}

/** CEO 知识包 `retrieveTopCompanyFactsForCeoPack` 的 query 后缀。 */
export function buildStrategyCeoPackMemoryQuerySuffix(profile: StrategyPlanningProfile = 'company'): string {
  if (profile === 'deliverable') {
    return 'documentation deliverable scope acceptance criteria milestones draft outline';
  }
  return 'collaboration cross-functional deliverables handoffs dependencies acceptance criteria org context';
}

/** Cortex `memory.search` 的 query 后缀（与 CEO 包同源语义，措辞略短以利向量）。 */
export function buildStrategyCortexMemorySearchQuerySuffix(profile: StrategyPlanningProfile = 'company'): string {
  if (profile === 'deliverable') {
    return 'documentation deliverable scope acceptance milestones constraints outline';
  }
  return 'collaboration deliverables handoffs dependencies acceptance org context constraints';
}

const STRATEGY_SURFACE_CONTAMINATION_MARKERS = [
  '【CEO_POST_INTENT_KNOWLEDGE_PACK',
  'CEO_POST_INTENT_KNOWLEDGE_PACK',
  '\n### A. room_members',
  '\n### B. company_cortex_core',
  '\n### C. recent_company_memory_facts',
] as const;

/**
 * Strip accidental echo of post-intent knowledge pack / markdown fences from L1 `goal` or phase text
 * so goal cards and RPC titles stay human-readable.
 */
export function sanitizeStrategyUserVisibleText(text: string, opts?: { maxLen?: number }): string {
  const raw = String(text ?? '').trim();
  if (!raw) return raw;
  let s = raw;
  let cut = s.length;
  for (const m of STRATEGY_SURFACE_CONTAMINATION_MARKERS) {
    const i = s.indexOf(m);
    if (i >= 0 && i < cut) cut = i;
  }
  s = s.slice(0, cut).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  s = s.replace(/\n{3,}/g, '\n\n');
  const maxLen = opts?.maxLen ?? 800;
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s.length > 0 ? s : raw.slice(0, maxLen).trim();
}
