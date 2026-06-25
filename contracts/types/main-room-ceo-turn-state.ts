/** 主群 CEO Replay 统一回合状态（Redis `collab:main_room_ceo_turn_state:v1`）。 */
export type MainRoomCeoTurnStateDraftSection = {
  draftGoalSummary: string;
  updatedAt: string;
  sourceMessageId?: string;
};

export type MainRoomCeoTurnStateAlignmentPhase = 'awaiting_execution_confirm' | 'authorized';

export type MainRoomCeoTurnStateAlignmentSection = {
  phase: MainRoomCeoTurnStateAlignmentPhase;
  draftGoalSummary: string;
  proposedHeavyPipelineKind: string;
  proposedAt: string;
  sourceMessageId?: string;
  authorizationMessageId?: string;
  authorizedAt?: string;
};

export type MainRoomCeoTurnState = {
  schemaVersion: 1;
  updatedAt: string;
  draft?: MainRoomCeoTurnStateDraftSection;
  alignment?: MainRoomCeoTurnStateAlignmentSection;
};
