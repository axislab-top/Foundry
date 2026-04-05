import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';
import type { Paginated } from './companiesApi';

/** Aligned with apps/api TasksService.serializeTask */
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'blocked'
  | 'cancelled';

export interface TaskEntity {
  id: string;
  companyId?: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus | string;
  priority?: string;
  dueDate?: string | null;
  expectedOutput?: string | null;
  progress?: number;
  assigneeType?: string;
  assigneeId?: string | null;
  skillIds?: string[] | null;
  blockedReason?: string | null;
  requiresHumanApproval?: boolean;
  metadata?: Record<string, unknown> | null;
  createdByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListTasksParams {
  page?: number;
  pageSize?: number;
  status?: TaskStatus | string;
  parentId?: string;
  rootOnly?: boolean;
  assigneeId?: string;
  assigneeType?: string;
  /** 与仪表盘部门负载口径一致：该部门 subtree 内组织节点 + 下属 Agent 上的任务 */
  departmentOrganizationNodeId?: string;
}

export async function listTasks(params?: ListTasksParams): Promise<Paginated<TaskEntity>> {
  const { data } = await apiClient.get<unknown>('/v1/tasks', { params });
  return unwrapResponse<Paginated<TaskEntity>>(data);
}

export async function getTask(id: string): Promise<TaskEntity> {
  const { data } = await apiClient.get<unknown>(`/v1/tasks/${id}`);
  return unwrapResponse<TaskEntity>(data);
}

export async function createTask(body: Record<string, unknown>): Promise<TaskEntity> {
  const { data } = await apiClient.post<unknown>('/v1/tasks', body);
  return unwrapResponse<TaskEntity>(data);
}

export async function updateTask(id: string, body: Record<string, unknown>): Promise<TaskEntity> {
  const { data } = await apiClient.patch<unknown>(`/v1/tasks/${id}`, body);
  return unwrapResponse<TaskEntity>(data);
}

export async function removeTask(id: string): Promise<void> {
  await apiClient.delete(`/v1/tasks/${id}`);
}

export async function requestBreakdown(body: {
  goal: string;
  context?: Record<string, unknown>;
  rootTaskId?: string;
}): Promise<unknown> {
  const { data } = await apiClient.post<unknown>('/v1/tasks/breakdown', body);
  return unwrapResponse(data);
}

export async function updateTaskProgress(
  id: string,
  body: {
    status?: TaskStatus;
    progress?: number;
    blockedReason?: string;
    approvalId?: string;
  },
): Promise<TaskEntity> {
  const payload = {
    data: {
      status: body.status,
      progress: body.progress,
      blockedReason: body.blockedReason,
      approvalId: body.approvalId,
    },
  };

  const { data } = await apiClient.patch<unknown>(`/v1/tasks/${id}/progress`, payload);
  return unwrapResponse<TaskEntity>(data);
}
