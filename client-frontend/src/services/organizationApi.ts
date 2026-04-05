import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';

export interface OrganizationTreeNode {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  description: string | null;
  agentId: string | null;
  order: number;
  metadata: Record<string, unknown> | null;
  children: OrganizationTreeNode[];
}

export async function getOrganizationTree(): Promise<OrganizationTreeNode[]> {
  const { data } = await apiClient.get<unknown>('/v1/organizations/tree');
  return unwrapResponse<OrganizationTreeNode[]>(data);
}
