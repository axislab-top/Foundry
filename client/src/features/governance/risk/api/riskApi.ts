import { apiClient } from "@/shared/api/client";
import type { AlertListFilters, AlertListResponse, AdminAlertRow } from "../types";
import { normalizeAdminAlert } from "../utils/riskTransform";

const PAGE_SIZE = 100;

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as { data?: unknown };
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

async function fetchAlertsPage(
  companyId: string,
  params: AlertListFilters,
): Promise<AlertListResponse> {
  const resp = await apiClient.get("/api/v1/alerts", {
    params: {
      companyId,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? PAGE_SIZE,
      severity: params.severity,
      status: params.status,
      type: params.type,
      search: params.search,
    },
  });
  const payload = unwrapPayload<{
    items?: unknown[];
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
  }>(resp.data);
  const items = Array.isArray(payload?.items)
    ? payload.items.map((x) => normalizeAdminAlert(x as Record<string, unknown>))
    : [];
  return {
    items,
    total: Number(payload?.total ?? items.length),
    page: Number(payload?.page ?? 1),
    pageSize: Number(payload?.pageSize ?? PAGE_SIZE),
    totalPages: Number(payload?.totalPages ?? 1),
  };
}

export async function fetchCompanyAlerts(
  companyId: string,
  filters: Omit<AlertListFilters, "page" | "pageSize"> = {},
): Promise<AdminAlertRow[]> {
  const first = await fetchAlertsPage(companyId, { ...filters, page: 1, pageSize: PAGE_SIZE });
  const all = [...first.items];
  if (first.totalPages <= 1) return all;

  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await fetchAlertsPage(companyId, { ...filters, page, pageSize: PAGE_SIZE });
    all.push(...next.items);
    if (next.items.length === 0) break;
  }
  return all;
}

export async function resolveCompanyAlert(alertId: string, remark?: string): Promise<{ id: string }> {
  const resp = await apiClient.patch(`/api/v1/alerts/${encodeURIComponent(alertId)}/resolve`, {
    remark: remark?.trim() || undefined,
  });
  return unwrapPayload<{ id: string }>(resp.data);
}
