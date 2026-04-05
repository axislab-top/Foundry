import { apiClient, ApiError, type ApiErrorPayload } from './apiClient';
import type { PaginatedResult } from './dashboardApi';

export type AiCompanyStatus = 'draft' | 'active' | 'suspended' | 'archived';

export interface AiCompanySummary {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  scale: 'small' | 'medium' | 'large' | null;
  status: AiCompanyStatus;
  isActive: boolean;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiCompanyDetail extends AiCompanySummary {
  goal: string | null;
  initialBudget: string | null;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  timezone: string | null;
  defaultLanguage: string | null;
  createdBy: string | null;
}

export interface CompaniesListQuery {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'status';
  sortOrder?: 'ASC' | 'DESC';
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  timestamp?: string;
}

function unwrapResponse<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'success' in raw) {
    const env = raw as ApiEnvelope<T>;
    if (env.success === true && 'data' in env) return env.data;
  }
  return raw as T;
}

export const companiesApi = {
  async list(query: CompaniesListQuery): Promise<PaginatedResult<AiCompanySummary>> {
    try {
      const { data } = await apiClient.get<ApiEnvelope<PaginatedResult<AiCompanySummary>>>('/v1/companies', {
        params: query,
      });
      return unwrapResponse(data);
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      const err = e as { message?: string; status?: number; payload?: ApiErrorPayload };
      throw new ApiError(err.message || 'Failed to load companies', err.status, err.payload);
    }
  },

  async get(id: string): Promise<AiCompanyDetail> {
    try {
      const { data } = await apiClient.get<ApiEnvelope<AiCompanyDetail>>(`/v1/companies/${id}`);
      return unwrapResponse(data);
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      const err = e as { message?: string; status?: number; payload?: ApiErrorPayload };
      throw new ApiError(err.message || 'Failed to load company', err.status, err.payload);
    }
  },

  async update(id: string, payload: Partial<AiCompanyDetail>): Promise<AiCompanyDetail> {
    try {
      const { data } = await apiClient.patch<ApiEnvelope<AiCompanyDetail>>(`/v1/companies/${id}`, payload);
      return unwrapResponse(data);
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      const err = e as { message?: string; status?: number; payload?: ApiErrorPayload };
      throw new ApiError(err.message || 'Failed to update company', err.status, err.payload);
    }
  },

  async changeStatus(id: string, status: AiCompanyStatus, reason?: string): Promise<AiCompanyDetail> {
    try {
      const { data } = await apiClient.patch<ApiEnvelope<AiCompanyDetail>>(`/v1/companies/${id}/status`, {
        status,
        reason: reason || undefined,
      });
      return unwrapResponse(data);
    } catch (e: unknown) {
      if (e instanceof ApiError) throw e;
      const err = e as { message?: string; status?: number; payload?: ApiErrorPayload };
      throw new ApiError(err.message || 'Failed to change company status', err.status, err.payload);
    }
  },
};

