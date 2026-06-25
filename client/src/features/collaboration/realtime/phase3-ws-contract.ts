/**
 * W15：Phase 3 协作 WS 事件名契约（与 Gateway / Worker 出站命名对齐；未广播时监听器仅为桩）。
 * 根目录 `test/e2e/phase3-frontend-smoke.e2e-spec.ts` 应保持与此列表一致。
 */
export const PHASE3_COLLABORATION_WS_EVENTS = [
  "memory.graph.updated",
  "cost.aware.decision",
  "director.autonomous.report",
  "cross.dept.coordination",
  "autonomous.event.domain.v2",
  "agent.graph.subgraph.invoked",
] as const;

export type Phase3CollaborationWsEvent = (typeof PHASE3_COLLABORATION_WS_EVENTS)[number];

/**
 * 协作网关 `/collaboration` 命名空间下、与 Phase3 桩列表正交的**核心房间事件**（API Redis → Gateway 转发）。
 * payload：`{ companyId, roomId, kind?: 'strategy_goal' | 'distribution', updatedAt?, traceId? }`
 *（与 `CollaborationRealtimePublisher.publishEnvelope` 对齐）。
 * 网关向 **协作房间 `socketRoomName`** 与 **`tasks:company:{companyId}`** 双播（与审批事件一致）；客户端完成 `join_company_tasks` 即可收到，无需额外 `join_room` 主群。
 */
export const COLLABORATION_CORE_ROOM_WS_EVENTS = [
  "main_room_draft:updated",
  "dispatch_plan_draft:updated",
  "dispatch:partial_failed",
] as const;

export type CollaborationCoreRoomWsEvent = (typeof COLLABORATION_CORE_ROOM_WS_EVENTS)[number];
