import { apiClient } from './apiClient';

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

export type AlertSeverity = 'low' | 'medium' | 'high';
export type AlertStatus = 'open' | 'resolved';

export interface AdminAlert {
  id: string;
  severity: AlertSeverity;
  type: string;
  companyId: string | null;
  agentId: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  status: AlertStatus;
  handledAt: string | null;
  handledBy: string | null;
  remark: string | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const alertsApi = {
  async list(params: {
    page: number;
    pageSize: number;
    search?: string;
    severity?: AlertSeverity;
    type?: string;
    status?: AlertStatus;
    companyId?: string;
    agentId?: string;
  }): Promise<PaginatedResult<AdminAlert>> {
    const { data } = await apiClient.get<ApiEnvelope<PaginatedResult<AdminAlert>>>('/admin/alerts', {
      params,
    });
    return unwrapResponse(data);
  },

  async resolve(alertId: string, patch: { remark?: string }): Promise<void> {
    await apiClient.patch(`/admin/alerts/${alertId}/resolve`, patch);
  },
};

