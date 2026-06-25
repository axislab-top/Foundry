export type TimeRange = "week" | "month" | "quarter";

export type BillingRecordType = "llm" | "skill" | "embedding" | "summary" | "agent_day" | "other";

export type BillingDashboardSummary = {
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
    lastMonthCost: string;
    monthInputTokens: number;
    monthOutputTokens: number;
    recordCountMonth: number;
  };
  topAgents: Array<{ id: string; cost: string }>;
  topTasks: Array<{ id: string; cost: string }>;
  topSkills: Array<{ id: string; cost: string }>;
  agentUsageRealtime: {
    aggregationIntervalMinutes: number;
    lastAggregatedAt: string | null;
    topAgentsToday: Array<{ agentId: string; agentName: string; totalCost: string; count: number }>;
    topDepartmentsToday: Array<{ organizationNodeId: string; departmentName: string; totalCost: string; count: number }>;
  };
};

export type CostTrendPoint = {
  date: string;
  cost: string;
};

export type AgentDailyRow = {
  id: string;
  agentId: string;
  agentName: string;
  departmentName: string | null;
  usageDate: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: string;
  outputCost: string;
  totalCost: string;
  llmModel: string | null;
  callCount: number;
};

export type BillingRecordRow = {
  id: string;
  recordType: BillingRecordType;
  modelName: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: string;
  currency: string;
  pricingSource: string | null;
  isNominal: boolean;
  occurredAt: string;
  usageDate: string | null;
};

export type AgentDailyDetailTarget = {
  agentId: string;
  agentName: string;
  usageDate: string;
};

export type AgentDailyQueryParams = {
  from?: string;
  to?: string;
  agentId?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
};
