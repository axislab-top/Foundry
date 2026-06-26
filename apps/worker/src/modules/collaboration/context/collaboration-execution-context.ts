import type { ContextGroundingPlan } from './context-grounding-plan.js';

/**
 * Phase 3.6：单条主群消息生命周期内共享的执行上下文（Memory Graph 检索去重等）。
 *
 * `memoryHits` 来自 {@link MemoryCrossCutService.retrieveBeforeIntent} 的 lead 检索，
 * 后续 Direct Agent / auxiliary 组装应复用，避免对同一 traceId 重复 `memory.search`。
 */
export type MemorySearchResult = {
  id?: string;
  content?: string;
  score?: number;
  namespace?: string;
  sourceType?: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

export type CollaborationExecutionContext = {
  traceId: string;
  /** API `memory.search` 原始命中行（与 lead 检索一致） */
  memoryHits: MemorySearchResult[];
  /** lead 检索完成时间（含缓存命中时的读取时刻） */
  retrievedAt: Date;
  /** lead `retrieveBeforeIntent` 已为本回合执行（含 trace 缓存命中） */
  leadMemorySearchDone?: boolean;
  /** {@link CollaborationRetrievalPlannerService} 写入的统一检索计划版本 */
  retrievalPlannerVersion?: string;
  /**
   * `retrieveBeforeIntent` 拼好的 `promptContext`（roster 片段 + 检索块等），供直连/replay 组装
   * 与 Intent LLM 输入对齐，避免仅 raw 用户句而丢失 Intent 前横切。
   */
  leadPromptContext?: string;
  /**
   * 主群 Intent→replay 单回合组装的「最近对话节选」正文（与 {@link MainRoomReplayLlmContextService} 一致）。
   * L1 战略层默认复用，避免再次 `collaboration.messages.list`。
   */
  transcriptSnapshotForTurn?: string;
  /** 组织部门快照修订指纹（如 `updatedAt:deptCount`），供观测与缓存键 */
  orgSnapshotRevision?: string;
  /** 本回合 Context Grounding Planner 产出的按需注入计划（主群 CEO 回复路径 SSOT）。 */
  contextGroundingPlan?: ContextGroundingPlan;
};

export type { ContextGroundingPlan } from './context-grounding-plan.js';
