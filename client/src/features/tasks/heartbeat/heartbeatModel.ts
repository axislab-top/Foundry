import type { ExecutionLogEntry, TaskRunItem } from "@/features/tasks/api/tasksTypes";
import type {
  ActivityTimelineItem,
  DirectorReportView,
  DirectorReportsSection,
  HeartbeatDashboardRawData,
  HeartbeatDashboardViewModel,
  HeartbeatStatusBanner,
  HeartbeatStatCards,
  PatrolRunView,
} from "./heartbeat-types";
import { isHeartbeatRun } from "./heartbeat-api";

const STATUS_BANNER: Record<
  HeartbeatStatusBanner["level"],
  Omit<HeartbeatStatusBanner, "level">
> = {
  normal: {
    label: "系统正常运行",
    labelEn: "All Systems Operational",
    color: "text-green-700",
    bg: "bg-green-50",
    borderColor: "border-green-200",
  },
  running: {
    label: "巡检进行中",
    labelEn: "Patrol In Progress",
    color: "text-blue-700",
    bg: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  degraded: {
    label: "需要关注",
    labelEn: "Needs Attention",
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    borderColor: "border-yellow-200",
  },
  failed: {
    label: "最近巡检失败",
    labelEn: "Recent Patrol Failed",
    color: "text-red-700",
    bg: "bg-red-50",
    borderColor: "border-red-200",
  },
};

export function sortHeartbeatRuns(runs: TaskRunItem[]): TaskRunItem[] {
  return [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function resolveTriggerLabel(run: TaskRunItem): { label: string; labelEn: string } {
  const md = run.metadata ?? {};
  const kind = String(md.kind ?? md.runKind ?? "");
  if (kind === "ceo_heartbeat") {
    if (run.triggerSource === "temporal") return { label: "Temporal 调度", labelEn: "Temporal" };
    if (run.triggerSource === "nest_timer" || run.triggerSource === "schedule") {
      return { label: "定时巡检", labelEn: "Scheduled Patrol" };
    }
    return { label: "CEO 心跳巡检", labelEn: "CEO Heartbeat" };
  }
  if (kind === "autonomous_event") {
    if (run.triggerSource === "task_completed") return { label: "任务完成触发", labelEn: "Task Completed" };
    if (run.triggerSource === "budget_warning") return { label: "预算预警触发", labelEn: "Budget Warning" };
    return { label: "自主编排事件", labelEn: "Autonomous Event" };
  }
  if (run.triggerSource === "task_completed") return { label: "任务完成触发", labelEn: "Task Completed" };
  if (run.triggerSource === "budget_warning") return { label: "预算预警触发", labelEn: "Budget Warning" };
  return { label: "系统运行", labelEn: "System" };
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "暂无记录";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "刚刚";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function formatDuration(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function extractTierFromLogs(logs: ExecutionLogEntry[]): string | null {
  for (const log of logs) {
    const snap = log.outputSnapshot;
    if (snap && typeof snap.tier === "string") return snap.tier;
    if (log.stepType.includes("cheap")) return "cheap";
    if (log.stepType.includes("full")) return "full";
  }
  return null;
}

function mapReportRows(
  reports: unknown[],
  agents: Array<{ id: string; name: string; role?: string | null }>,
): DirectorReportView[] {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  return reports.map((raw, idx) => {
    const row = raw as Record<string, unknown>;
    const directorAgentId = String(row.directorAgentId ?? row.director_agent_id ?? `unknown-${idx}`);
    const agent = agentById.get(directorAgentId);
    return {
      directorAgentId,
      name: agent?.name ?? `Director ${directorAgentId.slice(0, 8)}`,
      role: agent?.role ?? "部门主管",
      ok: Boolean(row.ok ?? row.success ?? false),
      error: (row.error ?? null) as string | null,
      messageId: (row.messageId ?? row.message_id ?? null) as string | null,
    };
  });
}

/** 解析 Director fan-out 结果；emptyReason 用于空态文案 */
export function parseDirectorSection(
  logs: ExecutionLogEntry[],
  agents: Array<{ id: string; name: string; role?: string | null }>,
  config: HeartbeatDashboardRawData["config"],
  sourceRunId: string | null,
): DirectorReportsSection {
  if (config && !config.enabled) {
    return {
      reports: [],
      emptyReason: "Director 巡检报告已在配置中关闭；CEO 定时巡检仍会运行",
      stats: null,
      sourceRunId,
    };
  }

  const skipLog = logs.find((l) => l.stepType === "ceo.director_fanout.skip");
  if (skipLog?.message === "disabled") {
    return {
      reports: [],
      emptyReason: "本轮巡检跳过了 Director 报告（配置已关闭）",
      stats: null,
      sourceRunId,
    };
  }
  if (skipLog?.message === "already_done") {
    return {
      reports: [],
      emptyReason: "本轮巡检已完成 Director fan-out，无新增报告",
      stats: null,
      sourceRunId,
    };
  }

  const completeLog = logs.find((l) => l.stepType === "ceo.director_fanout.complete");
  const snap = completeLog?.outputSnapshot;
  const rawReports = Array.isArray(snap?.reports) ? snap.reports : [];
  const directorStats = snap?.directorStats as Record<string, unknown> | undefined;
  const stats =
    directorStats && typeof directorStats === "object"
      ? {
          total: Number(directorStats.total ?? rawReports.length),
          succeeded: Number(directorStats.success ?? directorStats.succeeded ?? 0),
          failed: Number(directorStats.failed ?? 0),
          riskLevel: (snap?.riskLevel as string | undefined) ?? null,
        }
      : rawReports.length > 0
        ? {
            total: rawReports.length,
            succeeded: rawReports.filter((r) => Boolean((r as Record<string, unknown>).ok)).length,
            failed: rawReports.filter((r) => !Boolean((r as Record<string, unknown>).ok)).length,
            riskLevel: (snap?.riskLevel as string | undefined) ?? null,
          }
        : null;

  if (rawReports.length === 0) {
    return {
      reports: [],
      emptyReason: sourceRunId
        ? "最近一次成功巡检未产生 Director 部门报告"
        : "尚无成功巡检记录，无法展示 Director 报告",
      stats,
      sourceRunId,
    };
  }

  return {
    reports: mapReportRows(rawReports, agents),
    emptyReason: null,
    stats,
    sourceRunId,
  };
}

/** @deprecated 使用 parseDirectorSection */
export function parseDirectorReports(
  logs: ExecutionLogEntry[],
  agents: Array<{ id: string; name: string; role?: string | null }>,
): DirectorReportView[] {
  return parseDirectorSection(logs, agents, null, null).reports;
}

function buildStatusHint(
  config: HeartbeatDashboardRawData["config"],
  directorSection: DirectorReportsSection,
): string | undefined {
  if (config && !config.enabled) {
    return "Director 部门报告已关闭 · CEO 定时巡检仍在运行";
  }
  if (directorSection.stats && directorSection.stats.failed > 0) {
    return `最近 Director 报告 ${directorSection.stats.failed} 项失败`;
  }
  return undefined;
}

function computeStatusBanner(
  heartbeatRuns: TaskRunItem[],
  boardRuns: HeartbeatDashboardRawData["boardRuns"],
  hint?: string,
): HeartbeatStatusBanner {
  const latest = heartbeatRuns[0];
  const runningCount = boardRuns?.runningCount ?? 0;

  if (latest?.status === "running" || runningCount > 0) {
    return { level: "running", ...STATUS_BANNER.running, hint };
  }
  if (latest?.status === "failed") {
    return { level: "failed", ...STATUS_BANNER.failed, hint };
  }
  if ((boardRuns?.failedLast24h ?? 0) > 0) {
    return { level: "degraded", ...STATUS_BANNER.degraded, hint };
  }
  const riskScore = latest?.riskScore;
  if (typeof riskScore === "number" && riskScore >= 70) {
    return { level: "degraded", ...STATUS_BANNER.degraded, hint };
  }
  return { level: "normal", ...STATUS_BANNER.normal, hint };
}

function computeStats(
  heartbeatRuns: TaskRunItem[],
  boardRuns: HeartbeatDashboardRawData["boardRuns"],
): HeartbeatStatCards {
  const latest = heartbeatRuns[0];
  const runningCount = boardRuns?.runningCount ?? heartbeatRuns.filter((r) => r.status === "running").length;
  const todayRuns = heartbeatRuns.filter((r) => isToday(r.startedAt));
  const todaySucceeded = todayRuns.filter((r) => r.status === "succeeded").length;
  const todayTotal = todayRuns.length;
  const todaySuccessRate =
    todayTotal > 0 ? Math.round((todaySucceeded / todayTotal) * 100) : todayTotal === 0 && heartbeatRuns.length > 0 ? 100 : 0;

  let lastPatrolSub = latest ? resolveTriggerLabel(latest).label : "等待首次 tick";
  if (runningCount > 0) {
    lastPatrolSub = `${runningCount} 个巡检进行中`;
  }

  return {
    lastPatrolLabel: latest ? formatRelativeTime(latest.finishedAt ?? latest.startedAt) : "暂无记录",
    lastPatrolSub,
    failedLast24h: boardRuns?.failedLast24h ?? 0,
    runningPatrolCount: runningCount,
    todaySuccessRate,
    todayTotal,
    todaySucceeded,
    latestRiskScore: latest?.riskScore ?? null,
    latestRiskLevel: latest?.riskLevel ?? null,
  };
}

function mapPatrolRuns(heartbeatRuns: TaskRunItem[], latestRunLogs: ExecutionLogEntry[]): PatrolRunView[] {
  const latestId = heartbeatRuns[0]?.id;
  const tierForLatest = latestId ? extractTierFromLogs(latestRunLogs) : null;

  return heartbeatRuns.slice(0, 20).map((run, idx) => {
    const trigger = resolveTriggerLabel(run);
    const kind = String(run.metadata?.kind ?? run.metadata?.runKind ?? "");
    return {
      id: run.id,
      status: run.status,
      triggerLabel: trigger.label,
      triggerLabelEn: trigger.labelEn,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationLabel: formatDuration(run.startedAt, run.finishedAt),
      errorSummary: run.errorSummary,
      riskScore: run.riskScore ?? null,
      riskLevel: run.riskLevel ?? null,
      tier: idx === 0 ? tierForLatest : null,
      kind,
    };
  });
}

type TimelineSortable = ActivityTimelineItem & { sortAt: number };

function buildActivityTimeline(
  heartbeatRuns: TaskRunItem[],
  logs: ExecutionLogEntry[],
): ActivityTimelineItem[] {
  const items: TimelineSortable[] = [];

  for (const run of heartbeatRuns.slice(0, 8)) {
    const trigger = resolveTriggerLabel(run);
    items.push({
      id: `run-${run.id}`,
      time: formatTime(run.startedAt),
      agent: "CEO 编排",
      description: `${trigger.label} — ${run.status === "succeeded" ? "完成" : run.status === "failed" ? "失败" : "进行中"}`,
      result: run.status === "succeeded" ? "success" : run.status === "failed" ? "failed" : "warning",
      sortAt: new Date(run.startedAt).getTime(),
    });
  }

  for (const log of logs) {
    if (!log.stepType.startsWith("ceo.")) continue;
    const result: ActivityTimelineItem["result"] =
      log.stepType.includes("fail") || log.stepType.includes("error")
        ? "failed"
        : log.stepType.includes("skip")
          ? "warning"
          : "success";
    items.push({
      id: `log-${log.id}`,
      time: formatTime(log.createdAt),
      agent: "CEO 编排",
      description: log.message ?? log.stepType,
      result,
      sortAt: new Date(log.createdAt).getTime(),
    });
  }

  return items
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, 12)
    .map(({ sortAt: _sortAt, ...rest }) => rest);
}

export function mapHeartbeatDashboard(raw: HeartbeatDashboardRawData): HeartbeatDashboardViewModel {
  const heartbeatRuns = sortHeartbeatRuns(raw.taskRuns.filter(isHeartbeatRun));

  const latestRun = heartbeatRuns[0] ?? null;
  const directorSection = parseDirectorSection(
    raw.latestRunLogs,
    raw.agents,
    raw.config,
    raw.latestSucceededRunId,
  );
  const hint = buildStatusHint(raw.config, directorSection);
  const summary = raw.dailyBrief?.yesterdaySummary;

  return {
    statusBanner: computeStatusBanner(heartbeatRuns, raw.boardRuns, hint),
    stats: computeStats(heartbeatRuns, raw.boardRuns),
    config: raw.config,
    latestSummary: summary
      ? {
          text: summary.text,
          sourceLabel: summary.sourceLabel,
          fromHeartbeat: summary.sourceLabel.includes("Heartbeat"),
        }
      : null,
    patrolRuns: mapPatrolRuns(heartbeatRuns, raw.latestRunLogs),
    directorSection,
    activityTimeline: buildActivityTimeline(heartbeatRuns, raw.latestRunLogs),
    latestRunId: latestRun?.id ?? null,
    loadWarnings: raw.loadWarnings,
    generatedAt: new Date().toISOString(),
  };
}

export { formatRelativeTime, formatDuration, extractTierFromLogs };
