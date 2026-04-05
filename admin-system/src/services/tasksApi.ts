import { apiClient, ApiError } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

function unwrapResponse<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'success' in raw) {
    const env = raw as ApiEnvelope<T>;
    if (env.success === true && 'data' in env) return env.data;
  }
  return raw as T;
}

export interface TaskListItem {
  id: string;
  title: string;
  status: string;
  parentId?: string | null;
}

export interface TaskTreeResponse {
  rootId: string;
  nodes: Array<Record<string, unknown>>;
}

export interface TaskRunItem {
  id: string;
  status: string;
  triggerSource: string;
  startedAt: string;
  finishedAt?: string | null;
  errorSummary?: string | null;
}

export interface BoardRunSummary {
  companyId: string;
  runningCount: number;
  failedLast24h: number;
  recentRuns: TaskRunItem[];
  generatedAt: string;
}

export interface PaginatedTaskRuns {
  items: TaskRunItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TaskDependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
}

export interface ExecutionLogItem {
  id: string;
  agentId: string | null;
  stepType: string;
  message: string | null;
  runId: string | null;
  createdAt: string;
}

export interface ExecutionLogGroup {
  runId: string | null;
  latestAt: string;
  items: ExecutionLogItem[];
}

export interface ExecutionLogsGroupedResponse {
  taskId: string;
  groups: ExecutionLogGroup[];
}

export const tasksApi = {
  async listRootTasks(companyId: string): Promise<{ items: TaskListItem[] }> {
    const { data } = await apiClient.get<unknown>('/v1/tasks', {
      params: { companyId, rootOnly: true, page: 1, pageSize: 50 },
    });
    return unwrapResponse(data) as { items: TaskListItem[] };
  },

  async getTaskTree(companyId: string, rootId: string): Promise<TaskTreeResponse> {
    const { data } = await apiClient.get<unknown>(`/v1/tasks/${rootId}/tree`, {
      params: { companyId },
    });
    return unwrapResponse(data) as TaskTreeResponse;
  },

  async fetchBoardRunSummary(companyId: string): Promise<BoardRunSummary> {
    const { data } = await apiClient.get<unknown>('/v1/dashboard/board-runs', {
      params: { companyId },
    });
    return unwrapResponse(data) as BoardRunSummary;
  },

  async fetchTaskRuns(
    companyId: string,
    page = 1,
    limit = 30,
    taskId?: string,
  ): Promise<PaginatedTaskRuns> {
    const { data } = await apiClient.get<unknown>('/v1/task-runs', {
      params: { companyId, page, limit, ...(taskId ? { taskId } : {}) },
    });
    return unwrapResponse(data) as PaginatedTaskRuns;
  },

  async fetchTaskDependencies(companyId: string): Promise<{ edges: TaskDependencyEdge[] }> {
    const { data } = await apiClient.get<unknown>('/v1/tasks/dependencies', {
      params: { companyId },
    });
    return unwrapResponse(data) as { edges: TaskDependencyEdge[] };
  },

  async fetchExecutionLogsGrouped(
    companyId: string,
    taskId: string,
    limit = 200,
  ): Promise<ExecutionLogsGroupedResponse> {
    const { data } = await apiClient.get<unknown>(
      `/v1/tasks/${encodeURIComponent(taskId)}/execution-logs/grouped`,
      { params: { companyId, limit } },
    );
    return unwrapResponse(data) as ExecutionLogsGroupedResponse;
  },
};

export { ApiError };
