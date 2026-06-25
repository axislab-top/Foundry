import { apiClient } from "@/shared/api/client";
import type {
  TaskItem,
  TaskListResponse,
  TaskQueryParams,
  ExecutionLogEntry,
  ExecutionLogGroup,
  TaskRunListResponse,
} from "./tasksTypes";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as any;
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

const TASKS_PAGE_SIZE_MAX = 100;

export async function listTasks(params: TaskQueryParams = {}): Promise<TaskListResponse> {
  const pageSize =
    params.pageSize != null ? Math.min(Math.max(1, params.pageSize), TASKS_PAGE_SIZE_MAX) : undefined;
  const resp = await apiClient.get("/api/v1/tasks", {
    params: pageSize != null ? { ...params, pageSize } : params,
  });
  const payload = unwrapPayload<TaskListResponse>(resp.data);
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total: payload?.total ?? 0,
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 20,
    totalPages: payload?.totalPages,
  };
}

/** 分页拉取全部任务（API pageSize 上限 100） */
export async function listAllTasks(
  params: Omit<TaskQueryParams, "page" | "pageSize"> = {},
): Promise<TaskItem[]> {
  const pageSize = TASKS_PAGE_SIZE_MAX;
  const items: TaskItem[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const batch = await listTasks({ ...params, page, pageSize });
    items.push(...batch.items);
    totalPages =
      batch.totalPages ?? Math.max(1, Math.ceil((batch.total || items.length) / pageSize));
    page += 1;
  } while (page <= totalPages);
  return items;
}

export async function createTask(data: {
  title: string;
  priority?: string;
  projectId?: string;
  dueDate?: string;
}): Promise<TaskItem> {
  const resp = await apiClient.post("/api/v1/tasks", {
    title: data.title,
    priority: data.priority ?? "normal",
    projectId: data.projectId || undefined,
    dueDate: data.dueDate || undefined,
  });
  return unwrapPayload<TaskItem>(resp.data);
}

export async function getTask(taskId: string): Promise<TaskItem | null> {
  const resp = await apiClient.get(`/api/v1/tasks/${taskId}`);
  return unwrapPayload<TaskItem | null>(resp.data);
}

export async function getTaskTree(taskId: string): Promise<TaskItem[]> {
  const resp = await apiClient.get(`/api/v1/tasks/${taskId}/tree`);
  const payload = unwrapPayload<{ items?: TaskItem[] } | TaskItem[]>(resp.data);
  return Array.isArray(payload) ? payload : payload?.items ?? [];
}

export async function updateTaskProgress(
  taskId: string,
  payload: { progress?: number; status?: string; blockedReason?: string | null },
) {
  const resp = await apiClient.patch(`/api/v1/tasks/${taskId}/progress`, payload);
  return unwrapPayload<Record<string, unknown>>(resp.data);
}

export async function updateTaskStatus(taskId: string, status: string, progress?: number) {
  return updateTaskProgress(taskId, {
    status,
    ...(progress !== undefined ? { progress } : {}),
  });
}

function normalizeExecutionLogEntry(raw: Record<string, unknown>): ExecutionLogEntry {
  return {
    id: String(raw.id ?? ""),
    taskId: (raw.taskId ?? raw.task_id ?? null) as string | null,
    agentId: (raw.agentId ?? raw.agent_id ?? null) as string | null,
    stepType: String(raw.stepType ?? raw.step_type ?? ""),
    message: (raw.message ?? null) as string | null,
    outputSnapshot: (raw.outputSnapshot ?? raw.output_snapshot ?? null) as Record<string, unknown> | null,
    durationMs: (raw.durationMs ?? raw.duration_ms ?? null) as number | null,
    billingUnits: (raw.billingUnits ?? raw.billing_units ?? null) as string | null,
    traceId: (raw.traceId ?? raw.trace_id ?? null) as string | null,
    runId: (raw.runId ?? raw.run_id ?? null) as string | null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

function normalizeExecutionLogList(raw: unknown): ExecutionLogEntry[] {
  const payload = raw as { items?: unknown[] } | unknown[];
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  return rows.map((row) => normalizeExecutionLogEntry(row as Record<string, unknown>));
}

export async function getExecutionLogs(
  taskId: string,
  limit = 50,
  runId?: string,
): Promise<ExecutionLogEntry[]> {
  const resp = await apiClient.get(`/api/v1/tasks/${taskId}/execution-logs`, {
    params: { limit, ...(runId ? { runId } : {}) },
  });
  const payload = unwrapPayload<{ items?: ExecutionLogEntry[] } | ExecutionLogEntry[]>(resp.data);
  return normalizeExecutionLogList(payload);
}

export async function getExecutionLogsGrouped(
  taskId: string,
  limit = 200,
): Promise<ExecutionLogGroup[]> {
  const resp = await apiClient.get(`/api/v1/tasks/${taskId}/execution-logs/grouped`, {
    params: { limit },
  });
  const payload = unwrapPayload<{ groups?: ExecutionLogGroup[] }>(resp.data);
  return Array.isArray(payload?.groups) ? payload.groups : [];
}

export async function getExecutionLogsByRunId(
  runId: string,
  limit = 200,
): Promise<ExecutionLogEntry[]> {
  const resp = await apiClient.get(`/api/v1/task-runs/${runId}/execution-logs`, {
    params: { limit },
  });
  const payload = unwrapPayload<{ items?: ExecutionLogEntry[] } | ExecutionLogEntry[]>(resp.data);
  return normalizeExecutionLogList(payload);
}

function normalizeTaskRunItem(raw: Record<string, unknown>): import("./tasksTypes").TaskRunItem {
  return {
    id: String(raw.id ?? ""),
    companyId: String(raw.companyId ?? raw.company_id ?? ""),
    triggerSource: (raw.triggerSource ?? raw.trigger_source ?? "manual") as import("./tasksTypes").TaskRunTriggerSource,
    temporalWorkflowId: (raw.temporalWorkflowId ?? raw.temporal_workflow_id ?? null) as string | null,
    temporalRunId: (raw.temporalRunId ?? raw.temporal_run_id ?? null) as string | null,
    status: (raw.status ?? "running") as import("./tasksTypes").TaskRunStatus,
    startedAt: String(raw.startedAt ?? raw.started_at ?? ""),
    finishedAt: (raw.finishedAt ?? raw.finished_at ?? null) as string | null,
    errorSummary: (raw.errorSummary ?? raw.error_summary ?? null) as string | null,
    costEstimate: (raw.costEstimate ?? raw.cost_estimate ?? null) as string | null,
    actualCost: (raw.actualCost ?? raw.actual_cost ?? null) as string | null,
    metadata: (raw.metadata as Record<string, unknown> | null) ?? null,
    approvalRequestId: (raw.approvalRequestId ?? raw.approval_request_id ?? null) as string | null,
    riskLevel: raw.riskLevel as string | undefined,
    riskScore: raw.riskScore as number | undefined,
    riskReasons: raw.riskReasons as string[] | undefined,
    linkedTaskId: (raw.linkedTaskId ?? raw.linked_task_id ?? null) as string | null,
    linkedAgentId: (raw.linkedAgentId ?? raw.linked_agent_id ?? null) as string | null,
    linkedTaskTitle: (raw.linkedTaskTitle ?? raw.linked_task_title ?? null) as string | null,
  };
}

export async function listTaskRuns(params: {
  page?: number;
  limit?: number;
  taskId?: string;
} = {}): Promise<TaskRunListResponse> {
  const resp = await apiClient.get("/api/v1/task-runs", { params });
  const payload = unwrapPayload<TaskRunListResponse>(resp.data);
  const items = Array.isArray(payload?.items)
    ? payload.items.map((row) =>
        normalizeTaskRunItem(row as unknown as Record<string, unknown>),
      )
    : [];
  return {
    items,
    total: payload?.total ?? 0,
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 30,
    totalPages: payload?.totalPages ?? 1,
  };
}

/** 分页拉取任务运行记录（API limit 上限 100） */
export async function listAllTaskRuns(
  params: Omit<{ page?: number; limit?: number; taskId?: string }, "page"> = {},
): Promise<TaskRunListResponse["items"]> {
  const limit = Math.min(params.limit ?? 100, 100);
  const items: TaskRunListResponse["items"] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const batch = await listTaskRuns({ ...params, page, limit });
    items.push(...batch.items);
    totalPages = batch.totalPages ?? Math.max(1, Math.ceil((batch.total || items.length) / limit));
    page += 1;
  } while (page <= totalPages && page <= 10);
  return items;
}

export type AssigneeType = "agent" | "organization_node" | "unassigned";

export type AssignTaskPayload = {
  assigneeType: AssigneeType;
  assigneeId?: string | null;
  note?: string;
};

export async function assignTask(taskId: string, payload: AssignTaskPayload): Promise<TaskItem> {
  const resp = await apiClient.post(`/api/v1/tasks/${encodeURIComponent(taskId)}/assign`, payload);
  return unwrapPayload<TaskItem>(resp.data);
}

export async function dispatchTaskToDepartment(
  taskId: string,
  body: {
    departmentRoomId: string;
    fromRoomId?: string | null;
    threadTitle?: string | null;
  },
): Promise<{ roomId: string; threadId: string | null; messageId: string }> {
  const resp = await apiClient.post(`/api/v1/tasks/${encodeURIComponent(taskId)}/chat/dispatch`, {
    departmentRoomId: body.departmentRoomId,
    fromRoomId: body.fromRoomId ?? undefined,
    threadTitle: body.threadTitle ?? undefined,
  });
  return unwrapPayload<{ roomId: string; threadId: string | null; messageId: string }>(resp.data);
}

export async function reportTaskToMain(
  taskId: string,
  body: {
    summary: string;
    mainRoomId?: string | null;
    sourceRoomId?: string | null;
    sourceThreadId?: string | null;
  },
): Promise<{ roomId: string; messageId: string }> {
  const resp = await apiClient.post(`/api/v1/tasks/${encodeURIComponent(taskId)}/chat/report`, {
    summary: body.summary,
    mainRoomId: body.mainRoomId ?? undefined,
    sourceRoomId: body.sourceRoomId ?? undefined,
    sourceThreadId: body.sourceThreadId ?? undefined,
  });
  return unwrapPayload<{ roomId: string; messageId: string }>(resp.data);
}

export async function requestTaskCoordination(
  taskId: string,
  body: {
    targetDepartmentRoomId: string;
    request: string;
    mainRoomId?: string | null;
    neededBy?: string | null;
    sourceRoomId?: string | null;
  },
): Promise<{ roomId: string; messageId: string }> {
  const resp = await apiClient.post(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/chat/coordination-request`,
    {
      targetDepartmentRoomId: body.targetDepartmentRoomId,
      request: body.request,
      mainRoomId: body.mainRoomId ?? undefined,
      neededBy: body.neededBy ?? undefined,
      sourceRoomId: body.sourceRoomId ?? undefined,
    },
  );
  return unwrapPayload<{ roomId: string; messageId: string }>(resp.data);
}

export async function completeMainRoomDistributionChild(
  taskId: string,
  body: { parentGoalTaskId: string; reason?: string | null },
): Promise<TaskItem> {
  const resp = await apiClient.post(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/goals/complete-main-room-distribution`,
    body,
  );
  return unwrapPayload<TaskItem>(resp.data);
}
