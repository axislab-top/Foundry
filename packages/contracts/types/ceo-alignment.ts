/**
 * 主群 CEO Replay 对齐状态机 — Worker / API / 客户端共享 metadata 契约。
 */

export type CeoAlignmentPhase =
  | 'idle'
  | 'aligning'
  | 'awaiting_execution_confirm'
  | 'authorized'
  | 'executing'
  | 'replied';

export interface CeoAlignmentMetadata {
  phase: CeoAlignmentPhase;
  draftGoalSummary?: string | null;
  proposedHeavyPipelineKind?: string | null;
  authorizationMessageId?: string | null;
  authorizedAt?: string | null;
  suggestedCollaborationMode?: 'execution' | null;
  executionIntentDetected?: boolean;
  /** Replay delegate `upgradeReason`：讨论模式下建议进入执行时的简要说明 */
  upgradeReason?: string | null;
  correlationId?: string;
  updatedAt: string;
}

export type CeoPipelineProgressStage =
  | 'strategy'
  | 'orchestration'
  | 'supervision'
  | 'dispatch_plan'
  | 'dispatch_plan_flush'
  | 'replay_propose'
  | 'replay_light'
  | 'replay_authorized'
  | 'dept_executing'
  | 'program_complete';

export type CeoPipelineProgressStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'awaiting_approval';

export interface CeoPipelineProgressMetadata {
  stage: CeoPipelineProgressStage;
  status: CeoPipelineProgressStatus;
  correlationId: string;
  traceId: string;
  updatedAt: string;
}
