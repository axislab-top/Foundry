import { adminAuthedRequestJson } from '../../../../shared/api/client';
import { fetchAllAdminListPages } from '../shared/fetchAllAdminListPages';
import type { McpToolRecord } from './types';

export type ApiMcpToolRecord = {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  semverVersion?: string | null;
  version?: number | null;
  securityProfile?: string | null;
  requiredPermissions?: string[] | null;
  isEnabled?: boolean;
  approvalStatus?: string | null;
  serverRef?: string | null;
  transport?: 'stdio' | 'sse' | 'http' | string | null;
  scope?: 'company' | 'agent' | 'layer' | string | null;
  endpointUrl?: string | null;
  boundSkillCount?: number;
  updatedAt?: string;
};

function toMcpToolRecord(row: ApiMcpToolRecord): McpToolRecord {
  const profile = String(row.securityProfile ?? 'safe');
  return {
    id: row.id,
    name: String(row.name ?? ''),
    displayName: String(row.displayName ?? row.name ?? ''),
    serverRef: String(row.serverRef ?? 'mcp-server'),
    endpointUrl: row.endpointUrl ? String(row.endpointUrl) : undefined,
    version: String(row.semverVersion ?? row.version ?? '1.0.0'),
    description: String(row.description ?? 'No description'),
    transport: (String(row.transport ?? 'sse') as McpToolRecord['transport']),
    scope: (String(row.scope ?? 'company') as McpToolRecord['scope']),
    status: !row.isEnabled ? 'draft' : row.approvalStatus === 'rejected' ? 'disabled' : 'active',
    riskLevel: profile === 'dangerous' || profile === 'shell' ? 'high' : profile === 'network' || profile === 'fs-write' ? 'medium' : 'low',
    securityProfile: (profile as McpToolRecord['securityProfile']),
    boundSkillCount: Number(row.boundSkillCount ?? 0),
    lastUpdatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : '-'
  };
}

export async function listAllAdminMcpTools(params?: {
  search?: string;
}): Promise<{ items: McpToolRecord[]; total: number }> {
  const search = params?.search?.trim();
  const rows = await fetchAllAdminListPages<ApiMcpToolRecord>((page, pageSize) => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) query.set('search', search);
    return `/api/admin/mcp-tools?${query.toString()}`;
  });
  const items = rows.map(toMcpToolRecord);
  return { items, total: items.length };
}

export async function listAdminMcpTools(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ items: McpToolRecord[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.search?.trim()) query.set('search', params.search.trim());
  const suffix = query.toString();
  const path = suffix ? `/api/admin/mcp-tools?${suffix}` : '/api/admin/mcp-tools';
  const resp = await adminAuthedRequestJson<{ items?: ApiMcpToolRecord[]; total?: number }>(path);
  const items = (resp.items ?? []).map(toMcpToolRecord);
  return { items, total: resp.total ?? items.length };
}

export async function createAdminMcpTool(payload: {
  name: string;
  displayName?: string;
  description: string;
  serverRef: string;
  transport: 'stdio' | 'sse' | 'http';
  scope: 'company' | 'agent' | 'layer';
  securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
  endpointUrl?: string | null;
  inputSchema: Record<string, unknown>;
  changeReason: string;
}): Promise<McpToolRecord> {
  const created = await adminAuthedRequestJson<ApiMcpToolRecord>('/api/admin/mcp-tools', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      displayName: payload.displayName ?? payload.name,
      description: payload.description,
      inputSchema: payload.inputSchema,
      securityProfile: payload.securityProfile,
      serverRef: payload.serverRef,
      transport: payload.transport,
      scope: payload.scope,
      endpointUrl: payload.endpointUrl ?? null,
      changeReason: payload.changeReason,
    }),
  });
  return toMcpToolRecord(created);
}

export async function patchAdminMcpTool(
  id: string,
  payload: Partial<{
    description: string;
    securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
    transport: 'stdio' | 'sse' | 'http';
    scope: 'company' | 'agent' | 'layer';
    changeReason: string;
    isEnabled: boolean;
  }>,
): Promise<McpToolRecord> {
  const next = await adminAuthedRequestJson<ApiMcpToolRecord>(`/api/admin/mcp-tools/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return toMcpToolRecord(next);
}

export async function deleteAdminMcpTool(id: string): Promise<void> {
  await adminAuthedRequestJson(`/api/admin/mcp-tools/${id}`, { method: 'DELETE' });
}

export async function testMcpToolConnection(id: string): Promise<{ ok: boolean; message: string }> {
  const result = await adminAuthedRequestJson<{ ok?: boolean; message?: string }>(
    `/api/admin/mcp-tools/${id}/test-connection`,
    { method: 'POST' },
  );
  return {
    ok: !!result.ok,
    message: result.message ?? (result.ok ? 'Connection test passed.' : 'Connection test failed.'),
  };
}

export type McpToolUsageImpact = {
  skillBindings: number;
  marketplaceRefs: number;
  pinnedRefs: number;
};

export async function getMcpToolUsageImpact(toolId: string, toolName: string): Promise<McpToolUsageImpact> {
  void toolName;
  const detail = await adminAuthedRequestJson<ApiMcpToolRecord>(`/api/admin/mcp-tools/${toolId}`);
  return {
    skillBindings: Number(detail.boundSkillCount ?? 0),
    marketplaceRefs: 0,
    pinnedRefs: 0
  };
}
