import { adminAuthedRequestJson } from '../../../../shared/api/client';
import { fetchAllAdminListPages } from '../shared/fetchAllAdminListPages';

export type ApiSkillRecord = {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  promptTemplate?: string | null;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  securityProfile?: string | null;
  requiredPermissions?: string[] | null;
  isEnabled?: boolean;
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected' | string | null;
  semverVersion?: string | null;
  version?: number | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // governance-ish fields used by admin UI
  category?: string[] | null;
  icon?: string | null;
};

export type ListSkillsResponse = {
  items?: ApiSkillRecord[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

export async function listAllAdminSkills(params: {
  search?: string;
  isEnabled?: boolean;
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'all';
}): Promise<{ items: ApiSkillRecord[]; total: number }> {
  const search = params.search?.trim();
  const items = await fetchAllAdminListPages<ApiSkillRecord>((page, pageSize) => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) query.set('search', search);
    if (typeof params.isEnabled === 'boolean') query.set('isEnabled', String(params.isEnabled));
    if (params.approvalStatus) query.set('approvalStatus', params.approvalStatus);
    return `/api/admin/skills?${query.toString()}`;
  });
  return { items, total: items.length };
}

export async function listAdminSkills(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  isEnabled?: boolean;
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'all';
}): Promise<ListSkillsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (typeof params.isEnabled === 'boolean') query.set('isEnabled', String(params.isEnabled));
  if (params.approvalStatus) query.set('approvalStatus', params.approvalStatus);
  const suffix = query.toString();
  const path = suffix ? `/api/admin/skills?${suffix}` : '/api/admin/skills';
  return adminAuthedRequestJson<ListSkillsResponse>(path);
}

export type ApiToolRef = {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  semverVersion?: string | null;
  version?: number | null;
};

export type ApiSkillDetail = {
  skill: ApiSkillRecord;
  skillMd?: string;
  toolBindings: Array<{
    id: string;
    toolId: string;
    position: number;
    isOverridden: boolean;
    configOverride: Record<string, unknown> | null;
    tool: ApiToolRef;
  }>;
  mcpToolBindings: Array<{
    id: string;
    mcpToolId: string;
    position: number;
    isOverridden: boolean;
    configOverride: Record<string, unknown> | null;
    mcpTool: ApiToolRef;
  }>;
};

export async function getAdminSkill(id: string): Promise<ApiSkillDetail> {
  return adminAuthedRequestJson<ApiSkillDetail>(`/api/admin/skills/${id}`);
}

export async function patchAdminSkill(id: string, payload: Record<string, unknown>): Promise<ApiSkillRecord> {
  return adminAuthedRequestJson<ApiSkillRecord>(`/api/admin/skills/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function createAdminSkill(payload: Record<string, unknown>): Promise<ApiSkillRecord> {
  return adminAuthedRequestJson<ApiSkillRecord>('/api/admin/skills', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export type SkillMdParsePayload = {
  name: string;
  displayName: string;
  description: string;
  promptTemplate: string;
  implementationType?: string;
  category?: string[] | null;
};

export async function parseAdminSkillMd(skillMd: string): Promise<{
  issues: Array<{ field: string; message: string }>;
  payload?: SkillMdParsePayload;
}> {
  return adminAuthedRequestJson('/api/admin/skills/parse-md', {
    method: 'POST',
    body: JSON.stringify({ skillMd })
  });
}

export async function deleteAdminSkill(id: string): Promise<{ success?: boolean; ok?: boolean }> {
  return adminAuthedRequestJson<{ success?: boolean; ok?: boolean }>(`/api/admin/skills/${id}`, {
    method: 'DELETE'
  });
}

export async function replaceSkillToolBindings(
  id: string,
  payload: { bindings: Array<{ toolId: string; position?: number; isOverridden?: boolean; configOverride?: Record<string, unknown> | null }>; changeReason: string }
): Promise<ApiSkillDetail> {
  return adminAuthedRequestJson<ApiSkillDetail>(`/api/admin/skills/${id}/tool-bindings`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function replaceSkillMcpToolBindings(
  id: string,
  payload: { bindings: Array<{ mcpToolId: string; position?: number; isOverridden?: boolean; configOverride?: Record<string, unknown> | null }>; changeReason: string }
): Promise<ApiSkillDetail> {
  return adminAuthedRequestJson<ApiSkillDetail>(`/api/admin/skills/${id}/mcp-tool-bindings`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export type BindingPickerOption = {
  id: string;
  name: string;
  version: string;
};

export type ListToolsResponse = {
  items: Array<{
    id: string;
    name: string;
    displayName: string;
    semverVersion?: string | null;
    version?: number | null;
  }>;
  total?: number;
};

async function listAllCatalogPages(pathPrefix: '/api/admin/tools' | '/api/admin/mcp-tools'): Promise<BindingPickerOption[]> {
  const pageSize = 100;
  const rows = await fetchAllAdminListPages<{
    id: string;
    name: string;
    displayName: string;
    semverVersion?: string | null;
    version?: number | null;
  }>((page) => `${pathPrefix}?page=${page}&pageSize=${pageSize}`);

  return rows.map((t) => ({
    id: t.id,
    name: t.displayName ?? t.name,
    version: String(t.semverVersion ?? t.version ?? '1.0.0')
  }));
}

export async function listToolsCatalog(): Promise<BindingPickerOption[]> {
  return listAllCatalogPages('/api/admin/tools');
}

export async function listMcpToolsCatalog(): Promise<BindingPickerOption[]> {
  return listAllCatalogPages('/api/admin/mcp-tools');
}
