import { apiClient } from "@/shared/api/client";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";
export type ApprovalScope = "pending" | "resolved_mine" | "company_all";

export type ApprovalItem = {
  id: string;
  companyId: string;
  status: ApprovalStatus;
  riskLevel: "L0" | "L1" | "L2" | "L3" | string;
  actionType: string;
  context: Record<string, unknown> | null;
  createdBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalListFilters = {
  scope: ApprovalScope;
  limit?: number;
  cursor?: string;
  status?: string;
  riskLevel?: string;
  riskBand?: "all" | "high" | "medium";
  actionTypePrefix?: string;
  actionType?: string;
  q?: string;
  createdAfter?: string;
  createdBefore?: string;
  resolvedAfter?: string;
  resolvedBefore?: string;
};

export type ApprovalListResponse = {
  items: ApprovalItem[];
  nextCursor: string | null;
};

export type ApprovalStats = {
  pendingCount: number;
  resolvedThisWeekCount: number;
  approvedThisWeekCount: number;
  rejectedThisWeekCount: number;
  approvalRateThisWeek: number | null;
  avgResolutionMsThisWeek: number | null;
};

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as any;
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

export async function listApprovals(filters: ApprovalListFilters): Promise<ApprovalListResponse> {
  const resp = await apiClient.get("/api/v1/approvals", { params: filters });
  const payload = unwrapPayload<ApprovalListResponse>(resp.data);
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    nextCursor: payload?.nextCursor ?? null,
  };
}

export async function listPendingApprovals(limit = 50): Promise<ApprovalItem[]> {
  const resp = await apiClient.get("/api/v1/approvals/pending", { params: { limit } });
  const payload = unwrapPayload<ApprovalItem[] | { items?: ApprovalItem[] }>(resp.data);
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function getApproval(approvalId: string): Promise<ApprovalItem | null> {
  const resp = await apiClient.get(`/api/v1/approvals/${approvalId}`);
  return unwrapPayload<ApprovalItem | null>(resp.data);
}

export async function approveApproval(approvalId: string, action: string, ttlMinutes?: number) {
  const resp = await apiClient.post(`/api/v1/approvals/${approvalId}/approve`, { action, ttlMinutes });
  return unwrapPayload<Record<string, unknown>>(resp.data);
}

export async function rejectApproval(approvalId: string, reason?: string) {
  const resp = await apiClient.post(`/api/v1/approvals/${approvalId}/reject`, { reason });
  return unwrapPayload<Record<string, unknown>>(resp.data);
}

export async function getApprovalStats(): Promise<ApprovalStats> {
  const resp = await apiClient.get("/api/v1/approvals/stats");
  return unwrapPayload<ApprovalStats>(resp.data);
}

