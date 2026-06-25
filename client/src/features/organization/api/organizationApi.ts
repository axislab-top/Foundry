import { apiClient } from "@/shared/api/client";
import type {
  AgentWorkspace,
  ApiAgent,
  CreateMarketplaceHirePayload,
  HireMarketplaceAgentResult,
  MarketplaceAgentPreset,
  OrgTreeNode,
  PlatformDepartmentApiRow,
} from "../types/api";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as { data?: unknown };
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

function parseListPayload<T>(raw: unknown): T[] {
  const payload = unwrapPayload<unknown>(raw);
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["items", "rows", "departments", "list"]) {
      const candidate = obj[key];
      if (Array.isArray(candidate)) return candidate as T[];
    }
  }
  return [];
}

export async function fetchOrganizationTree(): Promise<OrgTreeNode[]> {
  const resp = await apiClient.get("/api/v1/organizations/tree");
  const data = unwrapPayload<OrgTreeNode[]>(resp.data);
  return Array.isArray(data) ? data : [];
}

export async function fetchAgents(): Promise<ApiAgent[]> {
  const resp = await apiClient.get("/api/v1/agents", { params: { status: "active", pageSize: 200 } });
  const payload = unwrapPayload<{ items?: ApiAgent[] } | ApiAgent[]>(resp.data);
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  return rows.map((x) => {
    const raw = x as Record<string, unknown>;
    return {
      id: String(raw.id ?? ""),
      name: String(raw.name ?? ""),
      role: String(raw.role ?? ""),
      status: String(raw.status ?? "active"),
      organizationNodeId: (raw.organizationNodeId ?? raw.organization_node_id ?? null) as string | null,
      expertise: (raw.expertise as string | null) ?? null,
      avatarUrl: (raw.avatarUrl ?? raw.avatar_url ?? null) as string | null,
      metadata: (raw.metadata as Record<string, unknown> | null) ?? null,
      updatedAt: (raw.updatedAt ?? raw.updated_at ?? null) as string | null,
    };
  });
}

export async function fetchAgentWorkspace(agentId: string): Promise<AgentWorkspace> {
  const resp = await apiClient.get(`/api/v1/agents/${encodeURIComponent(agentId)}/workspace`);
  return unwrapPayload<AgentWorkspace>(resp.data);
}

export async function fetchPlatformDepartments(): Promise<PlatformDepartmentApiRow[]> {
  const resp = await apiClient.get("/api/v1/platform/departments");
  const rows = parseListPayload<Record<string, unknown>>(resp.data);
  return rows
    .map((x) => ({
      id: String(x.id ?? ""),
      slug: String(x.slug ?? "").trim(),
      displayName: String(x.displayName ?? x.display_name ?? x.name ?? x.slug ?? "").trim(),
      category: (x.category as string | null) ?? null,
      icon: (x.icon as string | null) ?? null,
      responsibilitySummary: (x.responsibilitySummary ?? x.responsibility_summary ?? null) as string | null,
      sortOrder: Number(x.sortOrder ?? x.sort_order ?? 0),
    }))
    .filter((x) => x.slug.length > 0);
}

export type AddDepartmentFromPlatformPayload = {
  platformDepartmentSlug: string;
  parentId?: string;
  description?: string;
};

export async function addDepartmentFromPlatform(
  payload: AddDepartmentFromPlatformPayload,
): Promise<OrgTreeNode> {
  const resp = await apiClient.post("/api/v1/organizations/departments/from-platform", payload);
  return unwrapPayload<OrgTreeNode>(resp.data);
}

function normalizeMarketplacePresetRow(raw: Record<string, unknown>): MarketplaceAgentPreset {
  const cp = raw.catalogPricing ?? raw.catalog_pricing ?? null;
  const cpObj = cp && typeof cp === "object" ? (cp as Record<string, unknown>) : null;
  const ratingRaw = raw.ratingAvg ?? raw.rating_avg;
  const rating =
    typeof ratingRaw === "number"
      ? ratingRaw
      : typeof ratingRaw === "string" && ratingRaw.trim()
        ? Number.parseFloat(ratingRaw)
        : null;

  return {
    id: String(raw.id ?? ""),
    slug: String(raw.slug ?? ""),
    name: String(raw.name ?? ""),
    expertise: (raw.expertise as string | null) ?? null,
    description: (raw.description as string | null) ?? null,
    agentCategory: String(raw.agentCategory ?? raw.agent_category ?? "employee"),
    departmentRoles: Array.isArray(raw.departmentRoles)
      ? (raw.departmentRoles as string[])
      : Array.isArray(raw.department_roles)
        ? (raw.department_roles as string[])
        : [],
    iconUrl: (raw.iconUrl ?? raw.icon_url ?? null) as string | null,
    boundModelName: (raw.boundModelName ?? raw.bound_model_name ?? null) as string | null,
    skillTags: Array.isArray(raw.skillTags)
      ? (raw.skillTags as string[])
      : Array.isArray(raw.skill_tags)
        ? (raw.skill_tags as string[])
        : [],
    usageCount: Number(raw.usageCount ?? raw.usage_count ?? 0),
    rating: Number.isFinite(rating) ? rating : null,
    catalogPricing: cpObj
      ? {
          displayLabel: (cpObj.displayLabel ?? cpObj.display_label ?? null) as string | null,
          dailyPriceCents:
            typeof cpObj.dailyPriceCents === "number"
              ? cpObj.dailyPriceCents
              : typeof cpObj.daily_price_cents === "number"
                ? cpObj.daily_price_cents
                : null,
        }
      : null,
  };
}

export type FetchMarketplaceAgentsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
};

export async function fetchMarketplaceAgentPresets(
  params: FetchMarketplaceAgentsParams = {},
): Promise<{ items: MarketplaceAgentPreset[]; total: number }> {
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 200));
  const search = params.search?.trim();
  const startPage = params.page ?? 1;
  const items: MarketplaceAgentPreset[] = [];
  let total = 0;
  let page = startPage;
  const maxPages = 20;

  for (let i = 0; i < maxPages; i++) {
    const resp = await apiClient.get("/api/v1/marketplace/agents", {
      params: {
        page,
        pageSize,
        ...(search ? { search } : {}),
      },
    });
    const payload = unwrapPayload<{
      items?: unknown[];
      total?: number;
      page?: number;
      totalPages?: number;
    }>(resp.data);
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    total = typeof payload?.total === "number" ? payload.total : rows.length;
    items.push(...rows.map((x) => normalizeMarketplacePresetRow(x as Record<string, unknown>)));
    if (items.length >= total || rows.length < pageSize) break;
    page += 1;
  }

  return { items, total };
}

export async function fetchMarketplaceAgentById(id: string): Promise<MarketplaceAgentPreset> {
  const resp = await apiClient.get(`/api/v1/marketplace/agents/${encodeURIComponent(id)}`);
  return normalizeMarketplacePresetRow(unwrapPayload<Record<string, unknown>>(resp.data));
}

type MarketplaceHireRequestRow = {
  id: string;
  status: string;
  marketplaceAgentId: string;
  organizationNodeId: string;
  resultAgentId: string | null;
  errorMessage: string | null;
};

function normalizeHireRequestRow(row: Record<string, unknown>): MarketplaceHireRequestRow {
  return {
    id: String(row.id ?? ""),
    status: String(row.status ?? ""),
    marketplaceAgentId: String(row.marketplaceAgentId ?? row.marketplace_agent_id ?? ""),
    organizationNodeId: String(row.organizationNodeId ?? row.organization_node_id ?? ""),
    resultAgentId: (row.resultAgentId ?? row.result_agent_id ?? null) as string | null,
    errorMessage: (row.errorMessage ?? row.error_message ?? null) as string | null,
  };
}

export async function createMarketplaceHireRequest(
  companyId: string,
  payload: CreateMarketplaceHirePayload,
): Promise<MarketplaceHireRequestRow> {
  const resp = await apiClient.post(
    `/api/v1/companies/${encodeURIComponent(companyId)}/marketplace/hire-requests`,
    payload,
  );
  return normalizeHireRequestRow(unwrapPayload<Record<string, unknown>>(resp.data));
}

export async function approveMarketplaceHireRequest(
  companyId: string,
  hireId: string,
): Promise<MarketplaceHireRequestRow> {
  const resp = await apiClient.post(
    `/api/v1/companies/${encodeURIComponent(companyId)}/marketplace/hire-requests/${encodeURIComponent(hireId)}/approve`,
    {},
    { timeout: 130_000 },
  );
  return normalizeHireRequestRow(unwrapPayload<Record<string, unknown>>(resp.data));
}

export async function hireMarketplaceAgent(
  companyId: string,
  payload: CreateMarketplaceHirePayload,
  options: { canApprove: boolean },
): Promise<HireMarketplaceAgentResult> {
  const created = await createMarketplaceHireRequest(companyId, payload);
  if (!options.canApprove) {
    return {
      hireRequestId: created.id,
      status: created.status,
      resultAgentId: null,
      pendingApproval: true,
      materializePending: false,
    };
  }
  const approved = await approveMarketplaceHireRequest(companyId, created.id);
  return {
    hireRequestId: approved.id,
    status: approved.status,
    resultAgentId: approved.resultAgentId,
    pendingApproval: false,
    materializePending: approved.status === "completed" && !approved.resultAgentId,
  };
}

export function extractApiErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === "object") {
      const msg = (data as { message?: string }).message;
      if (typeof msg === "string" && msg.trim()) return msg;
      const nested = (data as { data?: { message?: string } }).data?.message;
      if (typeof nested === "string" && nested.trim()) return nested;
    }
  }
  return error instanceof Error ? error.message : "操作失败";
}
