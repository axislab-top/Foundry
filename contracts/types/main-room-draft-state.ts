/**
 * HTTP GET `/api/v1/collaboration/rooms/:roomId/main-room-draft` 与 RPC 返回体。
 * 与 `MainRoomDraftPatchService.getDraftState` 对齐。
 */
export type StrategyGoalDraftQuickActionDto = {
  actionId: string;
  label: string;
  sendText: string;
};

export type MainRoomDraftStateDto = {
  hasSession: boolean;
  orchestrated: boolean;
  pendingDistributionConfirm: boolean;
  planId: string | null;
  mainGoalTaskId: string | null;
  updatedAt: string | null;
  traceId: string | null;
  /** Worker 写入的首张战略草稿消息 id；客户端可据此与群内富卡片对齐展示 */
  sourceStrategyMessageId: string | null;
  planning2026: {
    strategyGoal: string;
    strategicPhases: Array<{ phaseId: string; title: string; outcome: string; deadline?: string }>;
    planDigest?: {
      goal: string;
      topRiskLevel: string | null;
      strategicPhaseCount: number;
      constraintCount: number;
    };
  } | null;
  legacyPlanning: unknown | null;
  distributionPreview: Array<{ department: string; priority: string; deliverable: string }> | null;
  strategyGoalDraftQuickActions: StrategyGoalDraftQuickActionDto[] | null;
};
