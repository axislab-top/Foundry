import { apiClient } from "@/shared/api/client";
import {
  fetchBillingDashboard,
  fetchDailyCostTrend,
} from "@/features/costs/api/costsApi";
import type { BillingDashboardSummary } from "@/features/costs/types";
import type { BillingRecordRow, RechargeOrderRow, UpsertBudgetPayload } from "../types";

const PAGE_SIZE = 200;

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as { data?: unknown };
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

function normalizeRechargeOrder(raw: Record<string, unknown>): RechargeOrderRow {
  return {
    id: String(raw.id ?? ""),
    companyId: String(raw.companyId ?? raw.company_id ?? ""),
    amount: String(raw.amount ?? "0"),
    currency: String(raw.currency ?? "CREDIT"),
    status: String(raw.status ?? "pending") as RechargeOrderRow["status"],
    applyNote: (raw.applyNote ?? raw.apply_note ?? null) as string | null,
    rejectReason: (raw.rejectReason ?? raw.reject_reason ?? null) as string | null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    reviewedAt: (raw.reviewedAt ?? raw.reviewed_at ?? null) as string | null,
  };
}

function normalizeBillingRecord(raw: Record<string, unknown>): BillingRecordRow {
  return {
    id: String(raw.id ?? ""),
    recordType: String(raw.recordType ?? raw.record_type ?? "other") as BillingRecordRow["recordType"],
    modelName: (raw.modelName ?? raw.model_name ?? null) as string | null,
    cost: String(raw.cost ?? "0"),
    currency: String(raw.currency ?? "CREDIT"),
    occurredAt: String(raw.occurredAt ?? raw.occurred_at ?? ""),
    usageDate:
      raw.usageDate != null || raw.usage_date != null
        ? String(raw.usageDate ?? raw.usage_date).slice(0, 10)
        : null,
  };
}

async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const first = await fetchPage(0, PAGE_SIZE);
  const all = [...first.items];
  if (first.total <= all.length) return all;

  let offset = PAGE_SIZE;
  while (offset < first.total) {
    const page = await fetchPage(offset, PAGE_SIZE);
    all.push(...page.items);
    offset += PAGE_SIZE;
    if (page.items.length === 0) break;
  }
  return all;
}

export async function fetchGovernanceBillingDashboard(): Promise<BillingDashboardSummary> {
  return fetchBillingDashboard();
}

export async function fetchGovernanceCostTrend(days: number) {
  return fetchDailyCostTrend(days);
}

export async function fetchRechargeOrdersPage(
  companyId: string,
  params?: { status?: string; limit?: number; offset?: number },
): Promise<{ items: RechargeOrderRow[]; total: number }> {
  const resp = await apiClient.get(
    `/api/v1/companies/${encodeURIComponent(companyId)}/billing/recharge-orders`,
    { params },
  );
  const payload = unwrapPayload<{ items?: unknown[]; total?: number }>(resp.data);
  const items = Array.isArray(payload?.items)
    ? payload.items.map((x) => normalizeRechargeOrder(x as Record<string, unknown>))
    : [];
  return { items, total: Number(payload?.total ?? items.length) };
}

export async function fetchRechargeOrders(
  companyId: string,
  params?: { status?: string },
): Promise<{ items: RechargeOrderRow[]; total: number }> {
  const items = await fetchAllPages((offset, limit) =>
    fetchRechargeOrdersPage(companyId, { ...params, limit, offset }),
  );
  return { items, total: items.length };
}

export async function fetchGovernanceBillingRecordsPage(params: {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: BillingRecordRow[]; total: number }> {
  const resp = await apiClient.get("/api/v1/billing/records", {
    params: {
      from: params.from,
      to: params.to,
      excludeNominal: true,
      limit: params.limit ?? PAGE_SIZE,
      offset: params.offset ?? 0,
    },
  });
  const payload = unwrapPayload<{ items?: unknown[]; total?: number }>(resp.data);
  const items = Array.isArray(payload?.items)
    ? payload.items.map((x) => normalizeBillingRecord(x as Record<string, unknown>))
    : [];
  return { items, total: Number(payload?.total ?? items.length) };
}

export async function fetchGovernanceBillingRecords(params: {
  from?: string;
  to?: string;
}): Promise<{ items: BillingRecordRow[]; total: number }> {
  const items = await fetchAllPages((offset, limit) =>
    fetchGovernanceBillingRecordsPage({ ...params, limit, offset }),
  );
  return { items, total: items.length };
}

export async function upsertCompanyBudget(payload: UpsertBudgetPayload): Promise<void> {
  await apiClient.put("/api/v1/billing/budgets", payload);
}
