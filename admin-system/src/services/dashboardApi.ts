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

type CompanyStatus = 'draft' | 'active' | 'suspended' | 'archived';

export interface CompanyListItem {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  scale: 'small' | 'medium' | 'large' | null;
  status: CompanyStatus;
  isActive: boolean;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CompanySummary {
  companyId: string;
  taskCountsByStatus: Record<string, number>;
  activeWorkflow: { inProgress: number; pending: number; overdueCount: number };
  agents: { activeInTasks: number; totalActive: number };
  organization: { nodes: number };
  departmentLoad: Array<{ organizationNodeId: string; name?: string; activeTasks: number }>;
  billing: { totalUnitsFromExecutionLogs: string };
  generatedAt: string;
}

export interface BillingSummary {
  companyId: string;
  budget:
    | {
        totalAmount: string;
        usedAmount: string;
        utilization: number;
        warningThreshold: string;
        currency: string;
      }
    | null;
  aggregates: {
    todayCost: string;
    monthCost: string;
    recordCountMonth: number;
  };
  topAgents: Array<{ id: string; cost: string }>;
  topTasks: Array<{ id: string; cost: string }>;
  topSkills: Array<{ id: string; cost: string }>;
}

export interface PlatformOverviewStats {
  totalCompanies: number;
  sumInProgress: number;
  sumPending: number;
  sumOverdue: number;
  sumAgentsTotal: number;
  budgetUtilization: number;
  todayCost: number;
  completionRate: number;
  systemHealth: number;
  sparkToken24h: number[];
  sparkToken7d: number[];
  sparkCreation7d: number[];
  sparkAutonomy: number[];
}

export const dashboardApi = {
  async listCompanies(params: {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'status';
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<PaginatedResult<CompanyListItem>> {
    const { data } = await apiClient.get<ApiEnvelope<PaginatedResult<CompanyListItem>>>('/v1/companies', {
      params,
    });
    return unwrapResponse(data);
  },

  async fetchCompanySummary(companyId: string): Promise<CompanySummary> {
    const { data } = await apiClient.get<ApiEnvelope<CompanySummary>>('/v1/dashboard', {
      params: { companyId },
    });
    return unwrapResponse(data);
  },

  async fetchCompanyBillingSummary(companyId: string): Promise<BillingSummary> {
    const { data } = await apiClient.get<ApiEnvelope<BillingSummary>>('/v1/dashboard/billing', {
      params: { companyId },
    });
    return unwrapResponse(data);
  },

  async platformOverview(companyIds: string[]): Promise<PlatformOverviewStats> {
    const { data } = await apiClient.post<ApiEnvelope<PlatformOverviewStats>>(
      '/admin/dashboard/platform-overview',
      { companyIds },
    );
    return unwrapResponse(data);
  },
};

