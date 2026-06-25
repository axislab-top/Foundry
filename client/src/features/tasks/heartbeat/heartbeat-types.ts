import type { DailyBriefViewModel } from "@/features/daily-brief/daily-brief-api";
import type { ExecutionLogEntry, TaskRunItem } from "@/features/tasks/api/tasksTypes";

export type HeartbeatFrequency = "hourly" | "daily" | "weekly";

export type HeartbeatConfigApi = {
  id: string;
  companyId: string;
  enabled: boolean;
  frequency: HeartbeatFrequency;
  lastExecutedAt: string | null;
  metadata: {
    excludedDirectorAgentIds?: string[];
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
};

export type HeartbeatConfigViewModel = {
  id: string;
  companyId: string;
  enabled: boolean;
  frequency: HeartbeatFrequency;
  lastExecutedAt: string | null;
  excludedDirectorAgentIds: string[];
};

export type UpdateHeartbeatConfigPayload = {
  enabled?: boolean;
  frequency?: HeartbeatFrequency;
  metadata?: {
    excludedDirectorAgentIds?: string[];
  };
};

export type BoardRunSummaryApi = {
  companyId: string;
  runningCount: number;
  failedLast24h: number;
  recentRuns: TaskRunItem[];
  generatedAt: string;
};

export type HeartbeatStatusLevel = "normal" | "running" | "degraded" | "failed";

export type HeartbeatStatusBanner = {
  level: HeartbeatStatusLevel;
  label: string;
  labelEn: string;
  color: string;
  bg: string;
  borderColor: string;
  /** 补充说明（如 Director 报告开关与 CEO 巡检独立） */
  hint?: string;
};

export type DirectorFanoutStats = {
  total: number;
  succeeded: number;
  failed: number;
  riskLevel?: string | null;
};

export type DirectorReportsSection = {
  reports: DirectorReportView[];
  emptyReason: string | null;
  stats: DirectorFanoutStats | null;
  sourceRunId: string | null;
};

export type HeartbeatStatCards = {
  lastPatrolLabel: string;
  lastPatrolSub: string;
  failedLast24h: number;
  runningPatrolCount: number;
  todaySuccessRate: number;
  todayTotal: number;
  todaySucceeded: number;
  latestRiskScore: number | null;
  latestRiskLevel: string | null;
};

export type PatrolRunView = {
  id: string;
  status: TaskRunItem["status"];
  triggerLabel: string;
  triggerLabelEn: string;
  startedAt: string;
  finishedAt: string | null;
  durationLabel: string | null;
  errorSummary: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  tier: string | null;
  kind: string;
};

export type DirectorReportView = {
  directorAgentId: string;
  name: string;
  role: string;
  ok: boolean;
  error: string | null;
  messageId: string | null;
};

export type ActivityTimelineItem = {
  id: string;
  time: string;
  agent: string;
  description: string;
  result: "success" | "failed" | "warning";
};

export type HeartbeatDashboardViewModel = {
  statusBanner: HeartbeatStatusBanner;
  stats: HeartbeatStatCards;
  config: HeartbeatConfigViewModel | null;
  latestSummary: {
    text: string;
    sourceLabel: string;
    fromHeartbeat: boolean;
  } | null;
  patrolRuns: PatrolRunView[];
  directorSection: DirectorReportsSection;
  activityTimeline: ActivityTimelineItem[];
  latestRunId: string | null;
  loadWarnings: string[];
  generatedAt: string;
};

export type HeartbeatDashboardRawData = {
  config: HeartbeatConfigViewModel | null;
  boardRuns: BoardRunSummaryApi | null;
  taskRuns: TaskRunItem[];
  dailyBrief: DailyBriefViewModel | null;
  agents: Array<{ id: string; name: string; role?: string | null }>;
  latestRunLogs: ExecutionLogEntry[];
  latestSucceededRunId: string | null;
  loadWarnings: string[];
};

function unwrapGateway<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "success" in raw && (raw as { success: boolean }).success) {
    return (raw as unknown as { data: T }).data;
  }
  if (raw && typeof raw === "object" && "data" in raw) {
    return unwrapGateway<T>((raw as { data: unknown }).data);
  }
  return raw as T;
}

function normalizeHeartbeatConfig(raw: Record<string, unknown>): HeartbeatConfigApi {
  const metadata = (raw.metadata ?? {}) as HeartbeatConfigApi["metadata"];
  return {
    id: String(raw.id ?? ""),
    companyId: String(raw.companyId ?? raw.company_id ?? ""),
    enabled: Boolean(raw.enabled ?? true),
    frequency: (raw.frequency ?? "daily") as HeartbeatFrequency,
    lastExecutedAt: (raw.lastExecutedAt ?? raw.last_executed_at ?? null) as string | null,
    metadata,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
  };
}

export function mapHeartbeatConfigResponse(raw: unknown): HeartbeatConfigViewModel {
  const api = normalizeHeartbeatConfig(raw as Record<string, unknown>);
  const excluded = api.metadata?.excludedDirectorAgentIds;
  return {
    id: api.id,
    companyId: api.companyId,
    enabled: api.enabled,
    frequency: api.frequency,
    lastExecutedAt: api.lastExecutedAt,
    excludedDirectorAgentIds: Array.isArray(excluded) ? excluded.map(String) : [],
  };
}

export function mapBoardRunSummaryResponse(raw: unknown): BoardRunSummaryApi {
  const payload = unwrapGateway<Record<string, unknown>>(raw);
  const recentRuns = Array.isArray(payload.recentRuns)
    ? (payload.recentRuns as TaskRunItem[])
    : Array.isArray(payload.recent_runs)
      ? (payload.recent_runs as TaskRunItem[])
      : [];
  return {
    companyId: String(payload.companyId ?? payload.company_id ?? ""),
    runningCount: Number(payload.runningCount ?? payload.running_count ?? 0),
    failedLast24h: Number(payload.failedLast24h ?? payload.failed_last24h ?? 0),
    recentRuns,
    generatedAt: String(payload.generatedAt ?? payload.generated_at ?? new Date().toISOString()),
  };
}

export { unwrapGateway, normalizeHeartbeatConfig };
