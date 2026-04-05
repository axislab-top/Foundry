import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';

export interface RecommendedDepartmentPlacement {
  name: string;
  headAgentSlug: string | null;
  memberAgentSlugs: string[];
}

export interface CreateCompanyPayload {
  name: string;
  industry?: string;
  industryCode?: string;
  scale?: 'small' | 'medium' | 'large';
  goal?: string;
  initialBudget?: number;
  description?: string;
  timezone?: string;
  logoUrl?: string;
  /** 与 setup-recommendation 快照一致；有值时服务端按名称建部门并绑定商城主管/员工 */
  departmentPlacements?: RecommendedDepartmentPlacement[];
}

export interface QuickCreateResult {
  preview: CreateCompanyPayload;
  confidence: number;
  source: 'llm' | 'heuristic';
}

export interface CompanySetupRecommendationResult {
  source: 'llm' | 'fallback';
  modelName?: string;
  departmentPlacements: RecommendedDepartmentPlacement[];
  departments: string[];
  marketplaceAgentSlugs: string[];
  agentCountHint: number;
  confidence: number;
  fallbackReason?: string;
}

export interface Company {
  id: string;
  name: string;
  slug?: string | null;
  status?: string;
  industry?: string | null;
  industryCode?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listCompanies(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<Paginated<Company>> {
  const { data } = await apiClient.get<unknown>('/v1/companies', { params });
  return unwrapResponse<Paginated<Company>>(data);
}

export async function getCompany(id: string): Promise<Company> {
  const { data } = await apiClient.get<unknown>(`/v1/companies/${id}`);
  return unwrapResponse<Company>(data);
}

export async function createCompany(body: CreateCompanyPayload | Record<string, unknown>): Promise<Company> {
  const { data } = await apiClient.post<unknown>('/v1/companies', body);
  return unwrapResponse<Company>(data);
}

/** 向导用草稿公司（status=draft），用于在转正前携带合法租户 ID */
export async function createCompanyDraft(): Promise<Company> {
  const { data } = await apiClient.post<unknown>('/v1/companies/draft', {});
  return unwrapResponse<Company>(data);
}

/** 将草稿公司按向导数据转正（激活并触发 org / company.created） */
export async function completeCompanyWizard(
  draftCompanyId: string,
  body: CreateCompanyPayload | Record<string, unknown>,
): Promise<Company> {
  const { data } = await apiClient.post<unknown>(`/v1/companies/${draftCompanyId}/complete`, body);
  return unwrapResponse<Company>(data);
}

export async function quickCreatePreview(naturalLanguage: string): Promise<QuickCreateResult> {
  const { data } = await apiClient.post<unknown>('/v1/companies/quick-create', { naturalLanguage });
  return unwrapResponse<QuickCreateResult>(data);
}

export async function recommendCompanySetup(body: {
  industryCode: string;
  scale: 'small' | 'medium' | 'large';
  goal?: string;
  description?: string;
}): Promise<CompanySetupRecommendationResult> {
  const { data } = await apiClient.post<unknown>('/v1/companies/setup-recommendation', body);
  return unwrapResponse<CompanySetupRecommendationResult>(data);
}

export async function updateCompany(id: string, body: Record<string, unknown>): Promise<Company> {
  const { data } = await apiClient.patch<unknown>(`/v1/companies/${id}`, body);
  return unwrapResponse<Company>(data);
}

export async function changeCompanyStatus(
  id: string,
  body: Record<string, unknown>,
): Promise<Company> {
  const { data } = await apiClient.patch<unknown>(`/v1/companies/${id}/status`, body);
  return unwrapResponse<Company>(data);
}

export async function deleteCompany(id: string): Promise<{ ok: true }> {
  const { data } = await apiClient.delete<unknown>(`/v1/companies/${id}`);
  return unwrapResponse<{ ok: true }>(data);
}
