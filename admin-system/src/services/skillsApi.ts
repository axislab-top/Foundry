import { apiClient } from './apiClient';

export type GlobalSkillImplementationType = 'builtin' | 'langgraph' | 'api' | 'external';

export interface SkillAdminListItem {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  implementationType: string;
  version: number;
  isPublic: boolean;
  isSystem: boolean;
  updatedAt: string;
}

export interface SkillAdminDetail {
  id: string;
  companyId?: string | null;
  name: string;
  category: string | null;
  description: string | null;
  toolSchema: Record<string, unknown> | null;
  promptTemplate: string | null;
  implementationType: GlobalSkillImplementationType | string;
  handlerConfig: Record<string, unknown> | null;
  requiredPermissions: string[] | null;
  version: number;
  isPublic: boolean;
  isSystem: boolean;
  metadata: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt: string;
}

export interface SkillRevisionItem {
  id: string;
  skillId: string;
  companyId: string | null;
  version: number;
  status: string;
  reviewStatus?: string;
  riskLevel?: string | null;
  scanResult?: Record<string, unknown> | null;
  reviewComment?: string | null;
  name: string;
  category: string | null;
  description: string | null;
  implementationType: string;
  createdAt: string;
  artifactId: string | null;
}

export interface SkillUsageForSkill {
  skillId: string;
  skillName: string;
  callCount: number;
  failureCount: number;
  failureRate: number;
  avgDurationMs: number | null;
  avgBillingUnits: string | null;
  boundAgentCount: number;
}

export interface SkillUsageListResult {
  items: SkillUsageForSkill[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SkillUsageSingleResult extends SkillUsageForSkill {}

export interface SkillAuditLogItem {
  id: string;
  skillId: string | null;
  skillName: string | null;
  actionType: string;
  changedByUserId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  scanResult: Record<string, unknown> | null;
  riskLevel: string | null;
  reviewStatus: string;
  createdAt: string;
}

export interface SkillAuditLogsResult {
  items: SkillAuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function unwrapResponse<T>(data: unknown): T {
  if (
    data &&
    typeof data === 'object' &&
    'success' in data &&
    (data as { success: boolean }).success === true &&
    'data' in data
  ) {
    return (data as { data: T }).data;
  }
  return data as T;
}

export const skillsApi = {
  async list(params: { page?: number; pageSize?: number; search?: string; category?: string }): Promise<{
    items: SkillAdminListItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { data } = await apiClient.get('/admin/skills', { params });
    return unwrapResponse<any>(data);
  },

  async findOne(id: string): Promise<SkillAdminDetail> {
    const { data } = await apiClient.get(`/admin/skills/${id}`);
    return unwrapResponse<SkillAdminDetail>(data);
  },

  async create(input: {
    name: string;
    category?: string | null;
    description?: string | null;
    toolSchema?: Record<string, unknown> | null;
    promptTemplate?: string | null;
    implementationType?: GlobalSkillImplementationType;
    handlerConfig?: Record<string, unknown> | null;
    requiredPermissions?: string[] | null;
    version?: number;
    isPublic?: boolean;
    isSystem?: boolean;
    metadata?: Record<string, unknown> | null;
  }): Promise<SkillAdminDetail> {
    const { data } = await apiClient.post('/admin/skills', input);
    return unwrapResponse<SkillAdminDetail>(data);
  },

  async update(id: string, patch: any): Promise<{ id: string }> {
    const { data } = await apiClient.patch(`/admin/skills/${id}`, patch);
    return unwrapResponse<any>(data);
  },

  async remove(id: string): Promise<{ success: true }> {
    const { data } = await apiClient.delete(`/admin/skills/${id}`);
    return unwrapResponse<{ success: true }>(data);
  },

  async usage(params: {
    skillId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SkillUsageListResult | SkillUsageSingleResult> {
    const { data } = await apiClient.get('/admin/skills/usage', { params });
    return unwrapResponse<any>(data);
  },

  async auditLogs(params: {
    skillId?: string;
    actionType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SkillAuditLogsResult> {
    const { data } = await apiClient.get('/admin/skills/audit-logs', { params });
    return unwrapResponse<SkillAuditLogsResult>(data);
  },

  async revisions(skillId: string): Promise<SkillRevisionItem[]> {
    const { data } = await apiClient.get(`/admin/skills/${skillId}/revisions`);
    return unwrapResponse<SkillRevisionItem[]>(data);
  },

  async importRevisionFromArtifact(skillId: string): Promise<any> {
    const { data } = await apiClient.post(`/admin/skills/${skillId}/revisions/import-from-artifact`, {});
    return unwrapResponse<any>(data);
  },

  async publishRevision(skillId: string, revisionId: string): Promise<any> {
    const { data } = await apiClient.post(`/admin/skills/${skillId}/revisions/${revisionId}/publish`, {});
    return unwrapResponse<any>(data);
  },

  async reviewRevision(skillId: string, revisionId: string, action: 'approve' | 'reject', comment?: string): Promise<any> {
    const { data } = await apiClient.post(`/admin/skills/${skillId}/revisions/${revisionId}/review`, { action, comment });
    return unwrapResponse<any>(data);
  },

  async revokeRevision(skillId: string, revisionId: string): Promise<any> {
    const { data } = await apiClient.post(`/admin/skills/${skillId}/revisions/${revisionId}/revoke`, {});
    return unwrapResponse<any>(data);
  },

  async rollbackRevision(skillId: string, revisionId: string): Promise<any> {
    const { data } = await apiClient.post(`/admin/skills/${skillId}/revisions/${revisionId}/rollback`, {});
    return unwrapResponse<any>(data);
  },
};

