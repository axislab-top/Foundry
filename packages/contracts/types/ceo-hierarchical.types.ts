export interface CeoDepartmentExecutionPlan {
  slug: string;
  objective: string;
  priority?: 'p0' | 'p1' | 'p2' | 'p3';
  inputSummary?: string;
  metadata?: Record<string, unknown>;
}

export interface CeoHierarchicalPlan {
  summary?: string;
  departments: CeoDepartmentExecutionPlan[];
}

export interface CeoDepartmentPartialResult {
  departmentSlug: string;
  status: 'dispatched' | 'running' | 'completed' | 'failed' | 'escalated';
  note?: string;
  runId?: string;
  jobName?: string;
  sandboxId?: string | null;
  supervisorAgentId?: string;
  employeeAgentId?: string;
  taskId?: string;
  stage?: 'supervisor_split' | 'employee_execute' | 'supervisor_decision' | 'ceo_arbitration';
  decisionReason?: string;
  requiresDepartmentReport?: boolean;
  triggerCompanyRiskCheck?: boolean;
  ceoDecision?: 'approve' | 'revise' | 'terminate';
  updatedAt: string;
}
