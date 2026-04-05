import type { OrganizationNodeType } from '../entities/organization-node.entity.js';

export interface OrganizationTreeNodeDto {
  id: string;
  parentId: string | null;
  type: OrganizationNodeType;
  name: string;
  description: string | null;
  agentId: string | null;
  order: number;
  metadata: Record<string, any> | null;
  children: OrganizationTreeNodeDto[];
}
