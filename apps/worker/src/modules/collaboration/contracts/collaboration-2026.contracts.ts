import { z } from 'zod';
import type {
  CollaborationIntentType2026,
  CollaborationRoomMemberDirectoryEntry,
  CollaborationRoomContext2026,
  CollaborationRoomType,
} from '@contracts/types';

export type IntentType = CollaborationIntentType2026;
export type RoomMemberDirectoryEntry = CollaborationRoomMemberDirectoryEntry;
export type RoomContext = CollaborationRoomContext2026;
export type RoomType = CollaborationRoomType;

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 管线 / Admin / 旧存盘兼容用的 `CollaborationIntentType2026` 子集。
 * 主群前置路由 LLM **不**输出 intentType；见 {@link audienceRoutingLlmSchema}。
 */
export const INTENT_TYPE_CANONICAL: readonly IntentType[] = [
  'audience_resolution',
  'unknown',
] as const;

/**
 * 将任意 LLM / 旧存盘 intent 归一为 `audience_resolution`（唯一直译「找谁」）或 `unknown`。
 *
 * intent 层只做「找谁」不做语义分类，因此所有已知类型一律归为 `audience_resolution`。
 */
export function coerceIntentTypeFromLlm(raw: unknown): IntentType {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return 'unknown';
  if ((INTENT_TYPE_CANONICAL as readonly string[]).includes(s)) return s as IntentType;
  return 'audience_resolution';
}

export function coerceRiskLevelFromLlm(raw: unknown): RiskLevel {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const alias: Record<string, RiskLevel> = {
    low_risk: 'low',
    medium_risk: 'medium',
    med: 'medium',
    mid: 'medium',
    high_risk: 'high',
    severe: 'high',
    critical_risk: 'critical',
    blocker: 'critical',
  };
  if (alias[s]) return alias[s];
  if (s === 'low' || s === 'medium' || s === 'high' || s === 'critical') return s;
  return 'medium';
}

/**
 * 将 LLM 嵌套信封（output/result/…）压平为 {@link audienceRoutingLlmSchema} 可解析的键；不产出 intentType / userFacingReply。
 */
export function scrubAudienceRoutingLlmPayload(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }
  const o = parsed as Record<string, unknown>;
  const nestedPick = (k: string) => {
    const v = o[k];
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  };
  const nested =
    nestedPick('output') ?? nestedPick('result') ?? nestedPick('data') ?? nestedPick('payload');
  if (nested) {
    /** 去掉 envelope 键，避免 `{ ...nested, ...o }` 仍带 `output` 导致无限递归 */
    const stripped: Record<string, unknown> = { ...o };
    for (const k of ['output', 'result', 'data', 'payload'] as const) {
      delete stripped[k];
    }
    return scrubAudienceRoutingLlmPayload({ ...nested, ...stripped });
  }
  const first = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (o[k] !== undefined && o[k] !== null) return o[k];
    }
    return undefined;
  };
  const routingHintsRaw = o.routingHints;
  let rh: Record<string, unknown> | null = null;
  if (routingHintsRaw && typeof routingHintsRaw === 'object' && !Array.isArray(routingHintsRaw)) {
    rh = routingHintsRaw as Record<string, unknown>;
  }

  let targetAgentIdsRaw = first('targetAgentIds', 'target_agent_ids');
  if (
    rh &&
    rh.targetAgentIds !== undefined &&
    rh.targetAgentIds !== null &&
    Array.isArray(rh.targetAgentIds)
  ) {
    targetAgentIdsRaw = rh.targetAgentIds;
  }

  /** 受众路由 LLM 禁止产出对用户可见文案；若模型误输出则丢弃（下游仅服务端策略可写 userFacingReply）。 */
  return {
    confidence: first('confidence', 'confidence_score', 'score'),
    explanation: first('explanation', 'rationale', 'summary', 'reason', 'description', 'analysis'),
    ...(Array.isArray(targetAgentIdsRaw)
      ? {
          targetAgentIds: targetAgentIdsRaw
            .map((x) => String(x ?? '').trim())
            .filter(Boolean)
            .slice(0, 8),
        }
      : {}),
  };
}

/** 受众路由：可省略，缺省 0.88（与「仅 id 列表」JSON 兼容） */
const audienceRoutingConfidenceField = z.unknown().optional().transform((v): number => {
  if (v === undefined || v === null) return 0.88;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(1, v));
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  }
  return 0.88;
});

/** 受众路由：可省略，缺省占位（与「仅 id 列表」JSON 兼容） */
const audienceRoutingExplanationField = z.unknown().optional().transform((v): string => {
  const t = String(v ?? '').trim();
  if (!t) return 'audience_routing_llm';
  return t.length > 500 ? t.slice(0, 500) : t;
});

const targetAgentIdsLlmField = z
  .unknown()
  .optional()
  .transform((v): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const ids = v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 8);
    return ids.length ? ids : undefined;
  });

/**
 * 主群前置受众路由：模型 **仅** 产出 `targetAgentIds`（及可选 confidence/explanation）；不提供对用户可见字段。
 */
export const audienceRoutingLlmSchema = z
  .object({
    confidence: audienceRoutingConfidenceField,
    explanation: audienceRoutingExplanationField,
    targetAgentIds: targetAgentIdsLlmField,
  })
  .strip();

export type AudienceRoutingLlmParsed = z.infer<typeof audienceRoutingLlmSchema>;

const contextGroundingToolPolicyField = z
  .unknown()
  .optional()
  .transform((v): 'tools_allowed' | 'memory_only' => {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === 'memory_only') return 'memory_only';
    return 'tools_allowed';
  });

const contextGroundingPrefetchBlocksField = z
  .unknown()
  .optional()
  .transform((v): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, 8);
  });

const contextGroundingFactsQueryTypesField = z
  .unknown()
  .optional()
  .transform((v): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, 4);
  });

/**
 * Context Grounding Planner：模型产出预取块与 facts 类型；服务端再做白名单校验。
 */
export function scrubContextGroundingLlmPayload(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }
  const o = parsed as Record<string, unknown>;
  const nestedPick = (k: string) => {
    const v = o[k];
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  };
  const nested =
    nestedPick('output') ?? nestedPick('result') ?? nestedPick('data') ?? nestedPick('payload');
  if (nested) {
    const stripped: Record<string, unknown> = { ...o };
    for (const k of ['output', 'result', 'data', 'payload'] as const) {
      delete stripped[k];
    }
    return scrubContextGroundingLlmPayload({ ...nested, ...stripped });
  }
  const first = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (o[k] !== undefined && o[k] !== null) return o[k];
    }
    return undefined;
  };
  return {
    confidence: first('confidence', 'confidence_score', 'score'),
    explanation: first('explanation', 'rationale', 'summary', 'reason', 'description', 'analysis'),
    prefetchBlocks: first('prefetchBlocks', 'prefetch_blocks', 'blocks'),
    factsQueryTypes: first('factsQueryTypes', 'facts_query_types', 'factsTypes'),
    toolPolicy: first('toolPolicy', 'tool_policy'),
  };
}

export const contextGroundingLlmSchema = z
  .object({
    confidence: audienceRoutingConfidenceField,
    explanation: audienceRoutingExplanationField,
    prefetchBlocks: contextGroundingPrefetchBlocksField,
    factsQueryTypes: contextGroundingFactsQueryTypesField,
    toolPolicy: contextGroundingToolPolicyField,
  })
  .strip();

export type ContextGroundingLlmParsed = z.infer<typeof contextGroundingLlmSchema>;

export const DEPARTMENT_ROOM_INTERACTION_MODES = [
  'conversation',
  'delegate_tasks',
  'employee_direct',
] as const;

export type DepartmentRoomInteractionMode = (typeof DEPARTMENT_ROOM_INTERACTION_MODES)[number];

const departmentInteractionModeField = z
  .unknown()
  .transform((v): DepartmentRoomInteractionMode => {
    const s = String(v ?? '').trim();
    if ((DEPARTMENT_ROOM_INTERACTION_MODES as readonly string[]).includes(s)) {
      return s as DepartmentRoomInteractionMode;
    }
    return 'conversation';
  });

const departmentDelegationOutlineItemSchema = z
  .object({
    title: z.union([z.string(), z.number()]).transform((v) => String(v ?? '').trim().slice(0, 240)),
    suggestedExecutorAgentId: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v) => {
        const s = String(v ?? '').trim();
        return s || undefined;
      }),
  })
  .strip();

export const departmentRoomInteractionLlmSchema = z
  .object({
    interactionMode: departmentInteractionModeField,
    confidence: audienceRoutingConfidenceField,
    explanation: audienceRoutingExplanationField,
    targetAgentIds: targetAgentIdsLlmField,
    delegationOutline: z
      .array(departmentDelegationOutlineItemSchema)
      .max(6)
      .optional()
      .transform((arr) => (Array.isArray(arr) && arr.length ? arr : undefined)),
  })
  .strip();

export type DepartmentRoomInteractionLlmParsed = z.infer<typeof departmentRoomInteractionLlmSchema>;

export type DepartmentDelegationOutlineItem = {
  title: string;
  suggestedExecutorAgentId?: string;
};

export type ExecutionStage =
  | 'proposed'
  | 'approved'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'reviewed';

/** 2026.2：主管解析（校验后写入，供 unified / 观测）。 */
export type IntentDirectorResolutionRecord = {
  status: 'matched' | 'ambiguous' | 'none' | 'skipped';
  chosenAgentIds: string[];
  candidateIdsBeforeFilter: string[];
  partialGroupMatch?: boolean;
  droppedCandidateIds?: string[];
};

/**
 * 主群听众手递手：**解析到的房内目标**（冻结于主管校验入口）与下游 **policyRoutable**（`routingHints.targetAgentIds`）分离。
 * 仅由 `MainRoomDirectorIntentValidationService` 在过滤前写入 `audienceResolvedTargetAgentIds`。
 */
export type MainRoomAudienceHandoff = {
  audienceResolvedTargetAgentIds: string[];
};

/**
 * 受众路由归一化后的决策载体：以「本轮接话人 / 目标层」为主。
 * `intentType` / `targetLayer` 等由管线根据路由结果写入；**不应**把「要不要查库」类编排策略塞进本结构。
 */
export interface IntentDecision {
  traceId: string;
  roomType: RoomType;
  intentType: IntentType;
  confidence: number;
  explanation: string;
  routingHints: {
    riskLevel: RiskLevel;
    requiresParallelism: boolean;
    shouldExecute: boolean;
    responseMode: 'direct_reply' | 'group_reply' | 'execute_then_reply';
    /** 房内可直连的 agent（P1.3 召唤） */
    targetAgentIds?: string[];
    explicitDirectTargets?: boolean;
    summonAgentsMissingFromRoom?: string[];
    /** Summon enrich 来源（见 `MainRoomDirectSummonProvenance`） */
    summonProvenance?: string;
  };
  targetDepartmentSlugs: string[];
  targetLayer: 'strategy' | 'orchestration' | 'supervision' | 'director' | null;
  metadata?: Record<string, unknown>;
  /** 可选用户可见交接文案：**仅由服务端**（如主管白名单策略）写入；受众路由 LLM 不得产出。 */
  userFacingReply?: { text: string };
  /** 主群：听众解析结果（白名单前），与 `routingHints.targetAgentIds`（白名单后可直连）对照。 */
  mainRoomAudienceHandoff?: MainRoomAudienceHandoff;
  directorResolution?: IntentDirectorResolutionRecord;
  /** 2026.2：轻量自答（可选）。 */
  intentSelfReply?: { enabled: boolean; draft?: string };
}

/** 主群 Strategy 定稿：阶段性战略成果（与 `@contracts/types` StrategicPhase 对齐）。 */
export type CollaborationStrategicPhase2026 = {
  phaseId: string;
  title: string;
  outcome: string;
  deadline?: string;
};

export interface PlanningResult {
  /**
   * 规划会话锚点（与 `planId` / Temporal 根一致）。
   * @deprecated 与根目录 `@contracts/types` 对齐请使用 `planAnchorMessageId`；迁移期双写同值。
   */
  traceId: string;
  planAnchorMessageId?: string;
  turnMessageId?: string;
  routingRootMessageId?: string;
  runId?: string;
  roomId: string;
  roomType: RoomType;
  strategyGoal: string;
  strategicPhases: CollaborationStrategicPhase2026[];
  constraints: string[];
  /**
   * Strategy L1 模型输出的规模与成本；与审批门闸及 `@contracts/types` 的 `PlanningResult.resourceNeeds` 对齐。
   * 新写入的主群会话应始终带此字段；旧 Redis 载荷可能缺失。
   */
  resourceNeeds?: {
    estimatedTokens: number;
    estimatedCostUsd: number;
  };
  /**
   * Strategy L1 模型输出的时间窗（ISO-8601）。缺失时 legacy 可由阶段 deadline 推导并标注来源。
   */
  timeline?: {
    startAt: string;
    targetEndAt: string;
  };
  risks: Array<{
    level: RiskLevel;
    reason: string;
    mitigation?: string;
  }>;
  needsApproval: boolean;
  approvalReason?: string;
  /** PR4：与 L2/L3 对齐的结构化契约版本 */
  ceoStructuredContract?: '2026.pr4';
  /** PR4：在 `normal` 审批策略下因门禁被压掉的 LLM needsApproval */
  approvalSuppressedByPolicy?: boolean;
  /** PR4：供下游/UI 的稳定摘要块 */
  planDigest?: {
    goal: string;
    topRiskLevel: RiskLevel | null;
    strategicPhaseCount: number;
    constraintCount: number;
  };
}

export interface DistributionPlan {
  /** @deprecated 请使用 `planAnchorMessageId`；迁移期与锚点同值。 */
  traceId: string;
  planAnchorMessageId?: string;
  turnMessageId?: string;
  routingRootMessageId?: string;
  runId?: string;
  planningId: string;
  roomId: string;
  roomType: RoomType;
  /** PR4：三层结构化契约版本标记 */
  ceoStructuredContract?: '2026.pr4';
  parallelism: {
    enabled: boolean;
    maxParallelDepartments: number;
  };
  /**
   * 与 L2 `DistributionPlan.executionPlan`（@contracts/types）对齐的只读摘要，供 UI / 审计展示 DAG 与门闸。
   */
  executionPlanDigest?: {
    schemaVersion: string;
    distributionId: string;
    taskCount: number;
    edgeCount: number;
    supervisorReleaseGateCount: number;
  };
  departmentTasks: Array<{
    /** L2 任务 ID（与 Orchestration taskId 对齐） */
    sourceTaskId?: string;
    departmentSlug: string;
    directorAgentId?: string | null;
    priority: 'p0' | 'p1' | 'p2';
    objective: string;
    deliverables: string[];
    /** 由 L2 依赖边解析出的上游「部门」slug（去重）；与 DAG 一致 */
    dependsOnDepartmentSlugs?: string[];
    dueAt?: string;
  }>;
}

export interface HeavyExecutionOutput {
  traceId: string;
  planAnchorMessageId?: string;
  turnMessageId?: string;
  routingRootMessageId?: string;
  runId?: string;
  workflowId?: string;
  roomId: string;
  roomType: RoomType;
  /** PR4：与 L1/L2 对齐的结构化契约版本 */
  ceoStructuredContract?: '2026.pr4';
  stages: ExecutionStage[];
  partials: Array<{
    at: string;
    stage: ExecutionStage;
    text: string;
    sourceDepartmentSlug?: string;
  }>;
  departmentResults: Array<{
    departmentSlug: string;
    status: 'ok' | 'partial' | 'failed';
    summary: string;
    evidenceRefs?: string[];
  }>;
  finalText: string;
  finalSummary?: string;
  blockedReason?: string;
}

