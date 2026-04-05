import { apiClient } from './apiClient';
import { unwrapResponse } from './apiTypes';
import type { Paginated } from './companiesApi';

export type AgentRole = 'ceo' | 'director' | 'board_member' | 'executor';
export type AgentStatus = 'active' | 'inactive' | 'suspended';

export interface Agent {
  id: string;
  companyId?: string;
  name?: string;
  status?: AgentStatus | string;
  role?: AgentRole | string;
  llmModel?: string | null;
  expertise?: string | null;
  organizationNodeId?: string | null;
  humanInLoop?: boolean;
  avatarUrl?: string | null;
  [key: string]: unknown;
}

export async function listAgents(params?: Record<string, unknown>): Promise<Paginated<Agent>> {
  const { data } = await apiClient.get<unknown>('/v1/agents', { params });
  return unwrapResponse<Paginated<Agent>>(data);
}

export async function getAgent(id: string): Promise<Agent> {
  const { data } = await apiClient.get<unknown>(`/v1/agents/${id}`);
  return unwrapResponse<Agent>(data);
}

export async function createAgent(body: Record<string, unknown>): Promise<Agent> {
  const { data } = await apiClient.post<unknown>('/v1/agents', body);
  return unwrapResponse<Agent>(data);
}

export async function updateAgent(id: string, body: Record<string, unknown>): Promise<Agent> {
  const { data } = await apiClient.patch<unknown>(`/v1/agents/${id}`, body);
  return unwrapResponse<Agent>(data);
}

export async function removeAgent(id: string): Promise<void> {
  await apiClient.delete(`/v1/agents/${id}`);
}
