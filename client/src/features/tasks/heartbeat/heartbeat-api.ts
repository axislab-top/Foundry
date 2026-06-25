import { apiClient } from "@/shared/api/client";
import { fetchDailyBrief } from "@/features/daily-brief/daily-brief-api";
import { fetchAgents } from "@/features/organization/api/organizationApi";
import { getExecutionLogsByRunId, listAllTaskRuns } from "@/features/tasks/api/tasksApi";
import type { TaskRunItem } from "@/features/tasks/api/tasksTypes";
import {
  mapBoardRunSummaryResponse,
  mapHeartbeatConfigResponse,
  type HeartbeatConfigViewModel,
  type HeartbeatDashboardRawData,
  type UpdateHeartbeatConfigPayload,
  unwrapGateway,
} from "./heartbeat-types";

export async function fetchHeartbeatConfig(companyId: string): Promise<HeartbeatConfigViewModel> {
  const { data } = await apiClient.get(`/api/v1/companies/${companyId}/heartbeat-config`);
  return mapHeartbeatConfigResponse(unwrapGateway(data));
}

export async function updateHeartbeatConfig(
  companyId: string,
  payload: UpdateHeartbeatConfigPayload,
): Promise<HeartbeatConfigViewModel> {
  const { data } = await apiClient.patch(`/api/v1/companies/${companyId}/heartbeat-config`, payload);
  return mapHeartbeatConfigResponse(unwrapGateway(data));
}

export async function fetchBoardRunSummary() {
  const { data } = await apiClient.get("/api/v1/dashboard/board-runs");
  return mapBoardRunSummaryResponse(data);
}

function isHeartbeatRunRaw(run: { metadata?: Record<string, unknown> | null }) {
  const kind = String(run.metadata?.kind ?? run.metadata?.runKind ?? "");
  return kind === "ceo_heartbeat" || kind === "autonomous_event";
}

function sortByStartedAtDesc(runs: TaskRunItem[]): TaskRunItem[] {
  return [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export { isHeartbeatRunRaw as isHeartbeatRun };

export async function fetchHeartbeatDashboardRaw(companyId: string): Promise<HeartbeatDashboardRawData> {
  const loadWarnings: string[] = [];

  const [configResult, boardRunsResult, taskRunsResult, dailyBriefResult, agentsResult] =
    await Promise.allSettled([
      fetchHeartbeatConfig(companyId),
      fetchBoardRunSummary(),
      listAllTaskRuns({ limit: 100 }),
      fetchDailyBrief(),
      fetchAgents(),
    ]);

  if (configResult.status === "rejected") {
    const reason = String(configResult.reason ?? "");
    if (reason.includes("company_heartbeat_configs")) {
      loadWarnings.push(
        "数据库缺少 company_heartbeat_configs 表，请在项目根目录执行 pnpm migrate:run 后重启 API",
      );
    } else {
      loadWarnings.push("巡检配置加载失败，配置面板可能不可用");
    }
  }
  if (boardRunsResult.status === "rejected") {
    loadWarnings.push("看板运行摘要加载失败，24h 失败统计可能不准确");
  }
  if (taskRunsResult.status === "rejected") {
    loadWarnings.push("巡检历史加载失败");
  }
  if (dailyBriefResult.status === "rejected") {
    loadWarnings.push("CEO 摘要加载失败");
  }
  if (agentsResult.status === "rejected") {
    loadWarnings.push("Agent 列表加载失败，Director 名称可能显示为 ID");
  }

  const config = configResult.status === "fulfilled" ? configResult.value : null;
  const boardRuns = boardRunsResult.status === "fulfilled" ? boardRunsResult.value : null;
  const taskRuns = taskRunsResult.status === "fulfilled" ? taskRunsResult.value : [];
  const dailyBrief = dailyBriefResult.status === "fulfilled" ? dailyBriefResult.value : null;
  const agents =
    agentsResult.status === "fulfilled"
      ? agentsResult.value.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role ?? null,
        }))
      : [];

  const heartbeatRuns = sortByStartedAtDesc(taskRuns.filter(isHeartbeatRunRaw));
  const latestSucceeded = heartbeatRuns.find((r) => r.status === "succeeded") ?? null;

  let latestRunLogs: HeartbeatDashboardRawData["latestRunLogs"] = [];
  if (latestSucceeded?.id) {
    try {
      latestRunLogs = await getExecutionLogsByRunId(latestSucceeded.id);
    } catch {
      loadWarnings.push("最近一次成功巡检的执行日志加载失败");
      latestRunLogs = [];
    }
  }

  return {
    config,
    boardRuns,
    taskRuns,
    dailyBrief,
    agents,
    latestRunLogs,
    latestSucceededRunId: latestSucceeded?.id ?? null,
    loadWarnings,
  };
}
