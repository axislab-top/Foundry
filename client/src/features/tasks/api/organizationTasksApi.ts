import { apiClient } from "@/shared/api/client";

function unwrapPayload<T>(raw: unknown): T {
  const v = raw as Record<string, unknown>;
  if (v && typeof v === "object" && "data" in v) return unwrapPayload<T>(v.data);
  return raw as T;
}

/** 与 `organization.node.agents` / 组织节点下挂 Agent 节点一致 */
export type OrganizationNodeAgentRow = {
  id: string;
  name: string;
  agentId: string | null;
  type?: string;
};

/** `GET /v1/organizations/nodes/:id/agents` */
export async function listAgentsUnderOrganizationNode(
  nodeId: string,
  params?: { includeSelf?: boolean },
): Promise<OrganizationNodeAgentRow[]> {
  const resp = await apiClient.get(`/api/v1/organizations/nodes/${encodeURIComponent(nodeId)}/agents`, {
    params: params?.includeSelf === undefined ? {} : { includeSelf: params.includeSelf },
  });
  const data = unwrapPayload<OrganizationNodeAgentRow[]>(resp.data);
  return Array.isArray(data) ? data : [];
}
