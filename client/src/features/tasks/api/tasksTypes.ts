export type TaskStatus =
  | "pending"
  | "queued"
  | "in_progress"
  | "review"
  | "awaiting_approval"
  | "completed"
  | "blocked"
  | "cancelled"
  | "paused";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type AssigneeType = "unassigned" | "agent" | "organization_node";

export type TaskItem = {
  id: string;
  companyId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  expectedOutput: string | null;
  progress: number;
  assigneeType: AssigneeType;
  assigneeId: string | null;
  assigneeName?: string | null;
  blockedReason: string | null;
  requiresHumanApproval: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  projectId?: string | null;
  projectName?: string | null;
  children?: TaskItem[];
};

export type TaskQueryParams = {
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: string;
  assigneeId?: string;
  assigneeType?: string;
  rootOnly?: boolean;
  q?: string;
  projectId?: string;
};

export type TaskListResponse = {
  items: TaskItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
};

export type TaskStats = {
  total: number;
  inProgress: number;
  completed: number;
  blocked: number;
  pending: number;
  overdue: number;
};

export type ExecutionLogEntry = {
  id: string;
  taskId: string | null;
  agentId: string | null;
  stepType: string;
  message: string | null;
  outputSnapshot: Record<string, unknown> | null;
  durationMs: number | null;
  billingUnits: string | null;
  traceId: string | null;
  runId: string | null;
  createdAt: string;
};

export type ExecutionLogGroup = {
  runId: string | null;
  latestAt: string;
  items: ExecutionLogEntry[];
};

export type TaskRunStatus = "running" | "succeeded" | "failed";

export type TaskRunTriggerSource =
  | "temporal"
  | "schedule"
  | "manual"
  | "nest_timer"
  | "task_completed"
  | "budget_warning";

export type TaskRunItem = {
  id: string;
  companyId: string;
  triggerSource: TaskRunTriggerSource;
  temporalWorkflowId: string | null;
  temporalRunId: string | null;
  status: TaskRunStatus;
  startedAt: string;
  finishedAt: string | null;
  errorSummary: string | null;
  costEstimate: string | null;
  actualCost: string | null;
  metadata: Record<string, unknown> | null;
  approvalRequestId: string | null;
  riskLevel?: string;
  riskScore?: number;
  riskReasons?: string[];
  linkedTaskId?: string | null;
  linkedAgentId?: string | null;
  linkedTaskTitle?: string | null;
};

export type TaskRunListResponse = {
  items: TaskRunItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type TaskDependency = {
  taskId: string;
  dependsOnTaskId: string;
};
