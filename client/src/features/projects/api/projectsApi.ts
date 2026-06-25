import { apiClient } from "@/shared/api/client";
import type {
  CreateProjectPayload,
  ProjectAgentSummary,
  ProjectItem,
  ProjectListResponse,
  ProjectQueryParams,
  ProjectTaskSummary,
  UpdateProjectPayload,
} from "./projectsTypes";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as { data?: unknown };
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

function normalizeProject(raw: Record<string, unknown>): ProjectItem {
  return {
    id: String(raw.id ?? ""),
    companyId: String(raw.companyId ?? raw.company_id ?? ""),
    name: String(raw.name ?? ""),
    client: String(raw.client ?? ""),
    status: (raw.status as ProjectItem["status"]) ?? "active",
    deadline: raw.deadline != null ? String(raw.deadline).slice(0, 10) : null,
    progress: Number(raw.progress ?? 0),
    notes: raw.notes != null ? String(raw.notes) : null,
    taskCount: Number(raw.taskCount ?? raw.task_count ?? 0),
    agentCount: Number(raw.agentCount ?? raw.agent_count ?? 0),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
  };
}

export async function listProjects(params: ProjectQueryParams = {}): Promise<ProjectListResponse> {
  const resp = await apiClient.get("/api/v1/projects", { params });
  const payload = unwrapPayload<ProjectListResponse>(resp.data);
  const items = Array.isArray(payload?.items)
    ? payload.items.map((x) => normalizeProject(x as Record<string, unknown>))
    : [];
  return {
    items,
    total: payload?.total ?? items.length,
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 20,
    totalPages: payload?.totalPages,
  };
}

export async function getProject(projectId: string): Promise<ProjectItem> {
  const resp = await apiClient.get(`/api/v1/projects/${encodeURIComponent(projectId)}`);
  return normalizeProject(unwrapPayload<Record<string, unknown>>(resp.data));
}

export async function createProject(data: CreateProjectPayload): Promise<ProjectItem> {
  const resp = await apiClient.post("/api/v1/projects", {
    ...data,
    deadline: data.deadline || null,
  });
  return normalizeProject(unwrapPayload<Record<string, unknown>>(resp.data));
}

export async function updateProject(
  projectId: string,
  data: UpdateProjectPayload,
): Promise<ProjectItem> {
  const resp = await apiClient.patch(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    ...data,
    deadline: data.deadline === "" ? null : data.deadline,
  });
  return normalizeProject(unwrapPayload<Record<string, unknown>>(resp.data));
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiClient.delete(`/api/v1/projects/${encodeURIComponent(projectId)}`);
}

export async function listProjectTasks(projectId: string): Promise<ProjectTaskSummary[]> {
  const resp = await apiClient.get(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks`);
  const payload = unwrapPayload<{ items?: ProjectTaskSummary[] } | ProjectTaskSummary[]>(resp.data);
  return Array.isArray(payload) ? payload : payload?.items ?? [];
}

export async function listProjectAgents(projectId: string): Promise<ProjectAgentSummary[]> {
  const resp = await apiClient.get(`/api/v1/projects/${encodeURIComponent(projectId)}/agents`);
  const payload = unwrapPayload<{ items?: ProjectAgentSummary[] } | ProjectAgentSummary[]>(resp.data);
  return Array.isArray(payload) ? payload : payload?.items ?? [];
}
