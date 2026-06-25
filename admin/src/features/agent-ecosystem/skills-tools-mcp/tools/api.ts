import { adminAuthedRequestJson } from '../../../../shared/api/client';
import { fetchAllAdminListPages } from '../shared/fetchAllAdminListPages';

export type ApiToolRecord = {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  implementationType?: string | null;
  securityProfile?: string | null;
  semverVersion?: string | null;
  version?: number | null;
  createdBy?: string | null;
  isEnabled?: boolean;
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected' | string | null;
  requiredPermissions?: string[] | null;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  handlerConfig?: Record<string, unknown> | null;
  updatedAt?: string;
  boundSkillCount?: number;
};

type ListSkillsResponse = {
  items?: ApiToolRecord[];
  total?: number;
};

export async function listAllAdminTools(params?: {
  search?: string;
}): Promise<{ items: ApiToolRecord[]; total: number }> {
  const search = params?.search?.trim();
  const items = await fetchAllAdminListPages<ApiToolRecord>((page, pageSize) => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) query.set('search', search);
    return `/api/admin/tools?${query.toString()}`;
  });
  return { items, total: items.length };
}

export async function listAdminTools(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ items: ApiToolRecord[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.search?.trim()) query.set('search', params.search.trim());
  const suffix = query.toString();
  const path = suffix ? `/api/admin/tools?${suffix}` : '/api/admin/tools';
  const result = await adminAuthedRequestJson<ListSkillsResponse>(path);
  const items = result.items ?? [];
  return { items, total: result.total ?? items.length };
}

export async function createAdminTool(payload: Record<string, unknown>): Promise<ApiToolRecord> {
  return adminAuthedRequestJson<ApiToolRecord>('/api/admin/tools', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getAdminTool(id: string): Promise<ApiToolRecord> {
  return adminAuthedRequestJson<ApiToolRecord>(`/api/admin/tools/${id}`);
}

export async function patchAdminTool(
  id: string,
  payload: Record<string, unknown>
): Promise<ApiToolRecord> {
  return adminAuthedRequestJson<ApiToolRecord>(`/api/admin/tools/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteAdminTool(id: string): Promise<void> {
  await adminAuthedRequestJson(`/api/admin/tools/${id}`, {
    method: 'DELETE'
  });
}

export type ToolUsageImpact = {
  skillBindings: number;
  marketplaceRefs: number;
  pinnedRefs: number;
};

function containsToolRef(value: unknown, toolId: string, toolName: string): boolean {
  if (!value) return false;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower.includes(toolId.toLowerCase()) || lower.includes(toolName.toLowerCase());
  }
  if (Array.isArray(value)) return value.some((item) => containsToolRef(item, toolId, toolName));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsToolRef(item, toolId, toolName)
    );
  }
  return false;
}

export async function getToolUsageImpact(toolId: string, toolName: string): Promise<ToolUsageImpact> {
  void toolName;
  // Plan A: authoritative bind count is derived from skill_tool_bindings (server-side).
  // Keep the UI shape but simplify impact estimation here.
  const detail = await getAdminTool(toolId);
  return {
    skillBindings: Number(detail.boundSkillCount ?? 0),
    marketplaceRefs: 0,
    pinnedRefs: 0
  };
}
