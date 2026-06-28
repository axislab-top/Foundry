export type ReplayDecisionKind =
  | 'continue_conversation'
  | 'ask_clarification'
  | 'start_discussion'
  | 'summarize_discussion'
  | 'propose_execution'
  | 'prepare_task_draft'
  | 'confirm_execution'
  | 'dispatch_to_departments'
  | 'no_op';

export interface ReplayExecutionHint {
  taskLike: boolean;
  expectedOutput?: string;
  acceptanceCriteria?: string[];
  deadlineHint?: string;
}

export interface ReplayDecisionSnapshot {
  companyId: string;
  roomId: string;
  triggerMessageId: string;
  kind: ReplayDecisionKind;
  confidence: number;
  requiresUserConfirmation: boolean;
  targetDepartmentSlugs: string[];
  targetAgentIds: string[];
  summary: string;
  rationale: string[];
  executionHint?: ReplayExecutionHint;
  source: 'conversation_replay' | 'manual' | 'system' | 'worker_main_room_replay';
}
