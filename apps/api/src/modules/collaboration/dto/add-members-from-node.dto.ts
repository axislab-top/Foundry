import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class AddMembersFromOrganizationNodeDto {
  @IsUUID()
  roomId: string;

  @IsUUID()
  organizationNodeId: string;

  /** subtree：该节点及子树全部带 agent 的节点；node_only：仅该节点绑定的 Agent */
  @IsOptional()
  @IsIn(['subtree', 'node_only'])
  scope?: 'subtree' | 'node_only';
}
