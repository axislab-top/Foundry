/**
 * HTTP GET/PATCH `/api/v1/collaboration/rooms/:roomId/dispatch-plan/draft` 与 RPC 返回体。
 */
import type { CeoDispatchAssignment, CeoDispatchExecutionOrder } from './ceo-dispatch-plan.js';
import type { DispatchPlanDraftQuickActionDto } from './ceo-dispatch-plan.js';

export type MainRoomDispatchPlanStateDto = {
  hasSession: boolean;
  dispatched: boolean;
  pendingDistributionConfirm: boolean;
  planId: string | null;
  planRevision: number | null;
  mainGoalTaskId: string | null;
  updatedAt: string | null;
  sourceMessageId: string | null;
  /** Redis 实际命中的 threadId */
  resolvedThreadId: string | null;
  /** 会话读取方式：thread / main_fallback / none */
  resolvedVia: 'thread' | 'main_fallback' | 'none' | null;
  goal: string | null;
  bodyMarkdown: string | null;
  executionOrder: CeoDispatchExecutionOrder | null;
  assignments: CeoDispatchAssignment[] | null;
  distributionPreview: Array<{ department: string; priority: string; deliverable: string }> | null;
  dispatchPlanDraftQuickActions: DispatchPlanDraftQuickActionDto[] | null;
};
