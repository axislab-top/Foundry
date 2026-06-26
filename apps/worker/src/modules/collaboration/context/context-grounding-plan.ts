import type { FactsQueryType } from '@contracts/types';

/** 服务端白名单：Planner 可选的 Human 事实层块。 */
export const CONTEXT_GROUNDING_BLOCK_IDS = [
  'speaker',
  'transcript',
  'memory',
  'company_profile',
  'org_snapshot',
  'room_roster',
  'company_people',
] as const;

export type ContextGroundingBlockId = (typeof CONTEXT_GROUNDING_BLOCK_IDS)[number];

export type ContextGroundingToolPolicy = 'tools_allowed' | 'memory_only';

export type ContextGroundingPlanSource = 'llm' | 'llm_fallback' | 'disabled';

/** Planner 产出的单回合上下文装配计划（写入 CollaborationExecutionContext）。 */
export type ContextGroundingPlan = {
  prefetchBlocks: ContextGroundingBlockId[];
  factsQueryTypes: FactsQueryType[];
  toolPolicy: ContextGroundingToolPolicy;
  confidence: number;
  source: ContextGroundingPlanSource;
  explanation?: string;
};

const BLOCK_SET = new Set<string>(CONTEXT_GROUNDING_BLOCK_IDS);

const PLANNER_FACTS_QUERY_TYPES = new Set<string>([
  'room_members',
  'company_people',
  'org_structure',
  'role_presence',
]);

export function isContextGroundingBlockId(v: string): v is ContextGroundingBlockId {
  return BLOCK_SET.has(v);
}

export function sanitizeContextGroundingBlockIds(raw: unknown): ContextGroundingBlockId[] {
  if (!Array.isArray(raw)) return [];
  const out: ContextGroundingBlockId[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (!id || seen.has(id) || !isContextGroundingBlockId(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 8) break;
  }
  return out;
}

export function sanitizePlannerFactsQueryTypes(raw: unknown): FactsQueryType[] {
  if (!Array.isArray(raw)) return [];
  const out: FactsQueryType[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (!id || seen.has(id) || !PLANNER_FACTS_QUERY_TYPES.has(id)) continue;
    seen.add(id);
    out.push(id as FactsQueryType);
    if (out.length >= 4) break;
  }
  return out;
}

/** Planner 失败或关闭时的安全默认：不含 roster / org / memory 预取。 */
export function buildMinimalContextGroundingFallback(source: ContextGroundingPlanSource): ContextGroundingPlan {
  return {
    prefetchBlocks: ['speaker', 'transcript'],
    factsQueryTypes: [],
    toolPolicy: 'tools_allowed',
    confidence: source === 'disabled' ? 1 : 0.5,
    source,
    explanation: source === 'disabled' ? 'planner_disabled' : 'context_grounding_llm_parse_failed',
  };
}

export function planIncludesBlock(plan: ContextGroundingPlan | null | undefined, block: ContextGroundingBlockId): boolean {
  return Boolean(plan?.prefetchBlocks?.includes(block));
}

/** fact layer 预取已覆盖 planner 块且无额外 factsQueryTypes 时，可跳过 replay 工具循环。 */
export function shouldSkipReplayToolLoop(params: {
  plan?: ContextGroundingPlan | null;
  diagnostics: { prefetchBlocks?: readonly string[] };
}): boolean {
  const plan = params.plan;
  if (!plan) return false;
  if ((plan.factsQueryTypes?.length ?? 0) > 0) return false;
  const prefetched = new Set(params.diagnostics.prefetchBlocks ?? []);
  for (const block of plan.prefetchBlocks ?? []) {
    if (block === 'speaker' || block === 'transcript') continue;
    if (!prefetched.has(block)) return false;
  }
  return (plan.prefetchBlocks?.length ?? 0) > 0;
}
