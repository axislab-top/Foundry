import { adminAuthedRequestJson } from '../../shared/api/client';

export type PlatformDepartmentRow = {
  id: string;
  slug: string;
  displayName: string;
  sortOrder: number;
  isDefaultForNewCompany: boolean;
  category: string | null;
  icon: string | null;
  recommendedHeadToken: string | null;
  defaultSkills: unknown[] | null;
  responsibilitySummary: string | null;
  taskTypeTags: string[];
  excludesTaskTypeTags: string[];
  director: { id: string; slug: string; name: string } | null;
};

export type PlatformDepartmentCapabilityPayload = {
  responsibilitySummary: string;
  taskTypeTags?: string[];
  excludesTaskTypeTags?: string[];
};

export async function listPlatformDepartments(): Promise<PlatformDepartmentRow[]> {
  return adminAuthedRequestJson<PlatformDepartmentRow[]>('/api/admin/platform/departments');
}

export async function createPlatformDepartment(
  payload: {
    slug: string;
    displayName: string;
    sortOrder?: number;
    isDefaultForNewCompany?: boolean;
    directorMarketplaceAgentId?: string | null;
  } & PlatformDepartmentCapabilityPayload,
): Promise<{ id: string }> {
  return adminAuthedRequestJson<{ id: string }>('/api/admin/platform/departments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePlatformDepartment(
  id: string,
  payload: {
    slug?: string;
    displayName?: string;
    sortOrder?: number;
    isDefaultForNewCompany?: boolean;
    responsibilitySummary?: string;
    taskTypeTags?: string[];
    excludesTaskTypeTags?: string[];
  },
): Promise<{ ok: true }> {
  return adminAuthedRequestJson<{ ok: true }>(`/api/admin/platform/departments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function removePlatformDepartment(id: string): Promise<{ ok: true }> {
  return adminAuthedRequestJson<{ ok: true }>(`/api/admin/platform/departments/${id}`, {
    method: 'DELETE',
  });
}

export async function setPlatformDepartmentDirector(
  id: string,
  payload: { marketplaceAgentId: string },
): Promise<{ ok: true }> {
  return adminAuthedRequestJson<{ ok: true }>(`/api/admin/platform/departments/${id}/director`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export type MarketplaceAgentListItem = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  boundModelName?: string | null;
  keyCount?: number;
  isPublished: boolean;
  agentCategory?: 'ceo' | 'department_head' | 'employee';
  departmentRoles?: string[];
  updatedAt: string | Date;
};

export type ListMarketplaceAgentsResponse = {
  items: MarketplaceAgentListItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

export async function listMarketplaceAgents(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'all' | 'published' | 'draft';
  agentCategory?: 'ceo' | 'department_head' | 'employee';
}): Promise<ListMarketplaceAgentsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.status) query.set('status', params.status);
  if (params.agentCategory) query.set('agentCategory', params.agentCategory);
  const suffix = query.toString();
  const path = suffix ? `/api/admin/marketplace/agents?${suffix}` : '/api/admin/marketplace/agents';
  return adminAuthedRequestJson<ListMarketplaceAgentsResponse>(path);
}
