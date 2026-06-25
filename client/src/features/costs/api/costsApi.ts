import { apiClient } from "@/shared/api/client";
import type {
  AgentDailyQueryParams,
  AgentDailyRow,
  BillingDashboardSummary,
  BillingRecordRow,
  CostTrendPoint,
} from "../types";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as { data?: unknown };
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

function normalizeAgentDailyRow(raw: Record<string, unknown>): AgentDailyRow {
  return {
    id: String(raw.id ?? ""),
    agentId: String(raw.agentId ?? raw.agent_id ?? ""),
    agentName: String(raw.agentName ?? raw.agent_name ?? "—"),
    departmentName: (raw.departmentName ?? raw.department_name ?? null) as string | null,
    usageDate: String(raw.usageDate ?? raw.usage_date ?? "").slice(0, 10),
    inputTokens: Number(raw.inputTokens ?? raw.input_tokens ?? 0),
    outputTokens: Number(raw.outputTokens ?? raw.output_tokens ?? 0),
    inputCost: String(raw.inputCost ?? raw.input_cost ?? "0"),
    outputCost: String(raw.outputCost ?? raw.output_cost ?? "0"),
    totalCost: String(raw.totalCost ?? raw.total_cost ?? "0"),
    llmModel: (raw.llmModel ?? raw.llm_model ?? null) as string | null,
    callCount: Number(raw.callCount ?? raw.call_count ?? 0),
  };
}

function normalizeBillingRecord(raw: Record<string, unknown>): BillingRecordRow {
  return {
    id: String(raw.id ?? ""),
    recordType: String(raw.recordType ?? raw.record_type ?? "other") as BillingRecordRow["recordType"],
    modelName: (raw.modelName ?? raw.model_name ?? null) as string | null,
    inputTokens: Number(raw.inputTokens ?? raw.input_tokens ?? 0),
    outputTokens: Number(raw.outputTokens ?? raw.output_tokens ?? 0),
    cost: String(raw.cost ?? "0"),
    currency: String(raw.currency ?? "CREDIT"),
    pricingSource: (raw.pricingSource ?? raw.pricing_source ?? null) as string | null,
    isNominal: Boolean(raw.isNominal ?? raw.is_nominal ?? false),
    occurredAt: String(raw.occurredAt ?? raw.occurred_at ?? ""),
    usageDate: raw.usageDate != null || raw.usage_date != null
      ? String(raw.usageDate ?? raw.usage_date).slice(0, 10)
      : null,
  };
}

function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeBillingDashboard(raw: Record<string, unknown>): BillingDashboardSummary {
  const aggregatesRaw = (raw.aggregates ?? raw) as Record<string, unknown>;
  const budgetRaw = (raw.budget ?? null) as Record<string, unknown> | null;
  const realtimeRaw = (raw.agentUsageRealtime ?? raw.agent_usage_realtime ?? {}) as Record<string, unknown>;

  const budget =
    budgetRaw && typeof budgetRaw === "object"
      ? {
          totalAmount: String(budgetRaw.totalAmount ?? budgetRaw.total_amount ?? "0"),
          usedAmount: String(budgetRaw.usedAmount ?? budgetRaw.used_amount ?? "0"),
          utilization: Number(budgetRaw.utilization ?? 0),
          warningThreshold: String(budgetRaw.warningThreshold ?? budgetRaw.warning_threshold ?? "0.7"),
          criticalThreshold: String(budgetRaw.criticalThreshold ?? budgetRaw.critical_threshold ?? "0.9"),
          currency: String(budgetRaw.currency ?? "CREDIT"),
        }
      : null;

  const topAgentsRaw = asUnknownArray(raw.topAgents ?? raw.top_agents);
  const topTasksRaw = asUnknownArray(raw.topTasks ?? raw.top_tasks);
  const topSkillsRaw = asUnknownArray(raw.topSkills ?? raw.top_skills);

  const topAgentsTodayRaw = asUnknownArray(realtimeRaw.topAgentsToday ?? realtimeRaw.top_agents_today);
  const topDepartmentsTodayRaw = asUnknownArray(
    realtimeRaw.topDepartmentsToday ?? realtimeRaw.top_departments_today,
  );

  return {
    companyId: String(raw.companyId ?? raw.company_id ?? ""),
    budget,
    aggregates: {
      todayCost: String(aggregatesRaw.todayCost ?? aggregatesRaw.today_cost ?? "0"),
      monthCost: String(aggregatesRaw.monthCost ?? aggregatesRaw.month_cost ?? "0"),
      lastMonthCost: String(aggregatesRaw.lastMonthCost ?? aggregatesRaw.last_month_cost ?? "0"),
      monthInputTokens: Number(aggregatesRaw.monthInputTokens ?? aggregatesRaw.month_input_tokens ?? 0),
      monthOutputTokens: Number(aggregatesRaw.monthOutputTokens ?? aggregatesRaw.month_output_tokens ?? 0),
      recordCountMonth: Number(aggregatesRaw.recordCountMonth ?? aggregatesRaw.record_count_month ?? 0),
    },
    topAgents: topAgentsRaw.map((item) => {
      const row = item as Record<string, unknown>;
      return { id: String(row.id ?? ""), cost: String(row.cost ?? "0") };
    }),
    topTasks: topTasksRaw.map((item) => {
      const row = item as Record<string, unknown>;
      return { id: String(row.id ?? ""), cost: String(row.cost ?? "0") };
    }),
    topSkills: topSkillsRaw.map((item) => {
      const row = item as Record<string, unknown>;
      return { id: String(row.id ?? ""), cost: String(row.cost ?? "0") };
    }),
    agentUsageRealtime: {
      aggregationIntervalMinutes: Number(
        realtimeRaw.aggregationIntervalMinutes ?? realtimeRaw.aggregation_interval_minutes ?? 10,
      ),
      lastAggregatedAt:
        realtimeRaw.lastAggregatedAt != null || realtimeRaw.last_aggregated_at != null
          ? String(realtimeRaw.lastAggregatedAt ?? realtimeRaw.last_aggregated_at)
          : null,
      topAgentsToday: topAgentsTodayRaw.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          agentId: String(row.agentId ?? row.agent_id ?? ""),
          agentName: String(row.agentName ?? row.agent_name ?? "—"),
          totalCost: String(row.totalCost ?? row.total_cost ?? "0"),
          count: Number(row.count ?? 0),
        };
      }),
      topDepartmentsToday: topDepartmentsTodayRaw.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          organizationNodeId: String(row.organizationNodeId ?? row.organization_node_id ?? ""),
          departmentName: String(row.departmentName ?? row.department_name ?? "—"),
          totalCost: String(row.totalCost ?? row.total_cost ?? "0"),
          count: Number(row.count ?? 0),
        };
      }),
    },
  };
}

export async function fetchBillingDashboard(): Promise<BillingDashboardSummary> {
  const resp = await apiClient.get("/api/v1/dashboard/billing");
  const payload = unwrapPayload<Record<string, unknown>>(resp.data);
  return normalizeBillingDashboard(payload ?? {});
}

export async function fetchDailyCostTrend(days: number): Promise<CostTrendPoint[]> {
  const resp = await apiClient.get("/api/v1/billing/daily-trend", { params: { days } });
  const payload = unwrapPayload<CostTrendPoint[] | { items?: CostTrendPoint[] }>(resp.data);
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  return rows.map((r) => ({
    date: String((r as CostTrendPoint).date ?? "").slice(0, 10),
    cost: String((r as CostTrendPoint).cost ?? "0"),
  }));
}

export async function fetchAgentDailyUsage(
  params: AgentDailyQueryParams,
): Promise<{ items: AgentDailyRow[]; total: number }> {
  const resp = await apiClient.get("/api/v1/billing/agent-daily", { params });
  const payload = unwrapPayload<{ items?: unknown[]; total?: number }>(resp.data);
  const items = Array.isArray(payload?.items)
    ? payload.items.map((x) => normalizeAgentDailyRow(x as Record<string, unknown>))
    : [];
  return { items, total: Number(payload?.total ?? items.length) };
}

export async function fetchBillingRecords(params: {
  agentId: string;
  usageDate: string;
  limit?: number;
}): Promise<BillingRecordRow[]> {
  const resp = await apiClient.get("/api/v1/billing/records", {
    params: {
      agentId: params.agentId,
      usageDate: params.usageDate,
      excludeNominal: true,
      limit: params.limit ?? 50,
    },
  });
  const payload = unwrapPayload<{ items?: unknown[] }>(resp.data);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((x) => normalizeBillingRecord(x as Record<string, unknown>));
}

export function timeRangeToDays(range: "week" | "month" | "quarter"): number {
  if (range === "week") return 7;
  if (range === "month") return 30;
  return 90;
}

export function timeRangeToIsoDates(range: "week" | "month" | "quarter"): { from: string; to: string } {
  const days = timeRangeToDays(range);
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
