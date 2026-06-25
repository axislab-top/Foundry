import { apiClient } from "@/shared/api/client";
import {
  mapScheduledPlaybook,
  unwrapPayload,
  type CreateScheduledPlaybookPayload,
  type ScheduledPlaybookViewModel,
  type UpdateScheduledPlaybookPayload,
} from "./schedules-types";

export type ScheduledPlaybookListResponse = {
  items: ScheduledPlaybookViewModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listScheduledPlaybooks(
  companyId: string,
  params?: { page?: number; pageSize?: number; enabled?: boolean },
): Promise<ScheduledPlaybookListResponse> {
  const { data } = await apiClient.get(`/api/v1/companies/${companyId}/scheduled-playbooks`, { params });
  const payload = unwrapPayload<Record<string, unknown>>(data);
  const items = Array.isArray(payload.items)
    ? payload.items.map((row) => mapScheduledPlaybook(row as Record<string, unknown>))
    : [];
  return {
    items,
    total: Number(payload.total ?? items.length),
    page: Number(payload.page ?? 1),
    pageSize: Number(payload.pageSize ?? items.length),
    totalPages: Number(payload.totalPages ?? 1),
  };
}

export async function getScheduledPlaybook(
  companyId: string,
  scheduleId: string,
): Promise<ScheduledPlaybookViewModel> {
  const { data } = await apiClient.get(`/api/v1/companies/${companyId}/scheduled-playbooks/${scheduleId}`);
  return mapScheduledPlaybook(unwrapPayload<Record<string, unknown>>(data));
}

export async function createScheduledPlaybook(
  companyId: string,
  payload: CreateScheduledPlaybookPayload,
): Promise<ScheduledPlaybookViewModel> {
  const { data } = await apiClient.post(`/api/v1/companies/${companyId}/scheduled-playbooks`, payload);
  return mapScheduledPlaybook(unwrapPayload<Record<string, unknown>>(data));
}

export async function updateScheduledPlaybook(
  companyId: string,
  scheduleId: string,
  payload: UpdateScheduledPlaybookPayload,
): Promise<ScheduledPlaybookViewModel> {
  const { data } = await apiClient.patch(
    `/api/v1/companies/${companyId}/scheduled-playbooks/${scheduleId}`,
    payload,
  );
  return mapScheduledPlaybook(unwrapPayload<Record<string, unknown>>(data));
}

export async function deleteScheduledPlaybook(companyId: string, scheduleId: string): Promise<void> {
  await apiClient.delete(`/api/v1/companies/${companyId}/scheduled-playbooks/${scheduleId}`);
}

export async function triggerScheduledPlaybookNow(
  companyId: string,
  scheduleId: string,
): Promise<{ enqueued: boolean; taskId?: string }> {
  const { data } = await apiClient.post(
    `/api/v1/companies/${companyId}/scheduled-playbooks/${scheduleId}/run-now`,
  );
  return unwrapPayload<{ enqueued: boolean; taskId?: string }>(data);
}
