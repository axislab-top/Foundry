import { adminAuthedRequestJson } from '../../shared/api/client';

export type AuditLogItem = {
  id: string;
  requestId: string | null;
  userId: string | null;
  companyId: string | null;
  apiKeyId: string | null;
  service: string;
  method: string;
  path: string;
  statusCode: number;
  clientIp: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export type AuditLogsQueryParams = {
  userId?: string;
  apiKeyId?: string;
  service?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogsQueryResult = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export async function queryAuditLogs(params: AuditLogsQueryParams): Promise<AuditLogsQueryResult> {
  const query = new URLSearchParams();
  if (params.userId?.trim()) query.set('userId', params.userId.trim());
  if (params.apiKeyId?.trim()) query.set('apiKeyId', params.apiKeyId.trim());
  if (params.service?.trim()) query.set('service', params.service.trim());
  if (params.method?.trim()) query.set('method', params.method.trim());
  if (params.path?.trim()) query.set('path', params.path.trim());
  if (typeof params.statusCode === 'number') query.set('statusCode', String(params.statusCode));
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));

  const suffix = query.toString();
  const path = suffix ? `/api/admin/audit-logs?${suffix}` : '/api/admin/audit-logs';
  return adminAuthedRequestJson<AuditLogsQueryResult>(path);
}
