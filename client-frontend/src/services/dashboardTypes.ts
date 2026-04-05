/** Shapes from apps/api DashboardService.getCompanySummary */
export interface CompanyDashboardSummary {
  companyId: string;
  taskCountsByStatus: Record<string, number>;
  activeWorkflow: {
    inProgress: number;
    pending: number;
    overdueCount: number;
  };
  agents: {
    activeInTasks: number;
    totalActive: number;
  };
  organization: {
    nodes: number;
  };
  departmentLoad: Array<{
    organizationNodeId: string;
    /** 部门组织节点名称（与组织结构一致；旧接口可能缺省） */
    name?: string;
    activeTasks: number;
  }>;
  billing: {
    totalUnitsFromExecutionLogs: string;
  };
  /** M5 复盘闭环指标 */
  retrospective?: {
    failedRuns7d: number;
    lessonsIngested7d: number;
    repeatFailurePatterns7d: number;
    repeatFailureRate7d: number;
  };
  recentSupervisorLessons?: Array<{
    id: string;
    runId: string;
    lesson: string;
    confidence: number;
    ingestedToMemory: boolean;
    isRepeatPattern: boolean;
    createdAt: string;
  }>;
  generatedAt: string;
}

/** Shapes from apps/api DashboardBillingService.getSummary */
export interface BillingDashboardSummary {
  companyId: string;
  budget: {
    totalAmount: string;
    usedAmount: string;
    utilization: number;
    warningThreshold: string;
    criticalThreshold: string;
    currency: string;
  } | null;
  aggregates: {
    todayCost: string;
    monthCost: string;
    recordCountMonth: number;
  };
  topAgents: Array<{ id: string; cost: string }>;
  topTasks: Array<{ id: string; cost: string }>;
  topSkills: Array<{ id: string; cost: string }>;
}
