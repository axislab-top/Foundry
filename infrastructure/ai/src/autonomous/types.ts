import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { CeoSupervisorState } from './ceo-state.js';

/** Phase 3.5/3.6：Early-Exit 子图 / 注册表 handler 的结构化输出 */
export type EarlyExitDecision = {
  canEarlyExit: boolean;
  confidence: number;
  /** 命中 early exit 时面向用户的自然语言回复（可为空则上游回退） */
  suggestedReply: string;
  /** Phase 3.6：统一决策原因（日志 / 排障） */
  reason?: string;
  /** Phase 3.6：与 `foundry.ceo.early_exit.decision` 打标对齐 */
  routeTag?: 'ceo_reply' | 'direct_agent' | 'autonomous_graph' | 'none';
};

/**
 * 由 Worker 注入：拉取 Dashboard + Memory +（可选）Budget/Org 摘要，写入 contextBundle。
 */
export type CeoIngestHandler = (state: CeoSupervisorState) => Promise<Partial<CeoSupervisorState>>;

/**
 * 由 Worker 注入：LLM 规划（结构化 JSON → planResultJson）。
 */
export type CeoPlanHandler = (state: CeoSupervisorState) => Promise<Partial<CeoSupervisorState>>;

/**
 * 由 Worker 注入：校验组织并持久化任务。
 */
export type CeoValidatePersistHandler = (state: CeoSupervisorState) => Promise<Partial<CeoSupervisorState>>;

/**
 * 由 Worker 注入：合并汇报正文。
 */
export type CeoSummarizeHandler = (state: CeoSupervisorState) => Promise<Partial<CeoSupervisorState>>;

/**
 * 由 Worker 注入：主群消息 + Memory + 审批事件。
 */
export type CeoNotifyHandler = (state: CeoSupervisorState) => Promise<Partial<CeoSupervisorState>>;

/**
 * CEO 计划后、持久化前：按组织节点解析默认执行 Agent，写回 planResultJson / hierarchicalMetaJson。
 */
export type HierarchicalExpandHandler = (
  state: CeoSupervisorState,
) => Promise<Partial<CeoSupervisorState>>;

export interface BuildCeoHeartbeatGraphOptions {
  ingest: CeoIngestHandler;
  plan: CeoPlanHandler;
  validatePersist: CeoValidatePersistHandler;
  summarize: CeoSummarizeHandler;
  notify: CeoNotifyHandler;
  /** 默认 MemorySaver；生产可换 Postgres checkpointer */
  checkpointer?: BaseCheckpointSaver;
  /**
   * 预留业务记忆适配器（与 checkpoint 分离）；
   * 当前由 Worker 侧节点内部消费。
   */
  memoryAdapter?: {
    search?: (payload: Record<string, unknown>) => Promise<unknown>;
    store?: (payload: Record<string, unknown>) => Promise<unknown>;
  };
}

export interface BuildHierarchicalHeartbeatGraphOptions extends BuildCeoHeartbeatGraphOptions {
  hierarchicalExpand: HierarchicalExpandHandler;
}
