import type {
  CeoHeartbeatRunCoordinatorOptions,
  CeoHeartbeatTriggerSource,
} from '../../tasks/ceo-heartbeat-run-coordinator.service.js';

export interface CompanyHeartbeatContext {
  companyId: string;
  tickAt: string;
  triggerSource: CeoHeartbeatTriggerSource;
  options?: CeoHeartbeatRunCoordinatorOptions;
}

export interface CompanyStateSnapshot {
  companyId: string;
  tickAt: string;
  triggerSource: CeoHeartbeatTriggerSource;
  capturedAt: string;
  companyName: string;
  budget: {
    remaining: number;
    warningThreshold: number;
    totalBudgetCount: number;
  };
  tasks: {
    pending: number;
    inProgress: number;
    review: number;
    blocked: number;
    completed: number;
  };
  approvals: {
    pending: number;
  };
  organization: {
    nodeCount: number;
  };
  summary: {
    pendingRisks: number;
    pendingApprovals: number;
    activeGoals: number;
  };
}

export interface CompanyStrategicContext {
  strategicNotes: string[];
  memorySignals: string[];
}

export interface CompanyReviewResult {
  healthScore: number;
  keyRisks: string[];
  focusAreas: string[];
  recommendations: string[];
  stuckTasks: CompanyStuckTaskSignal[];
  completionStatus: CompanyCompletionStatus;
}

export interface CompanyStuckTaskSignal {
  id: string;
  title: string;
  status: 'in_progress' | 'blocked';
  assigneeId?: string | null;
  ageHours: number;
  updatedAt?: string;
  possibleCause: 'self_mention_loop' | 'timeout' | 'unknown';
}

export interface CompanyCompletionStatus {
  openTasks: number;
  completedTasks: number;
  completionRate: number;
  blockedRate: number;
  stuckRate: number;
}

export interface CompanyPlan {
  nextActions: string[];
  dispatchMode: 'conservative' | 'balanced' | 'aggressive';
  plannerNotes?: string;
}

export interface CompanyExecutionResult {
  runId: string;
  dispatchedActions: string[];
}
