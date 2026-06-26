export type MentionResolvedFrom = 'uuid' | 'ceo' | 'natural_name' | 'natural_title' | 'mixed';

export interface MentionCandidate {
  agentId: string;
  name: string;
  role?: string | null;
  /** 可选；用于正文职务词与 agent 能力描述对齐（租户数据，非硬编码词表） */
  expertise?: string | null;
  organizationNodeId?: string | null;
}

export interface MentionResolveResult {
  agentIds: string[];
  nodeIds: string[];
  resolvedFrom: MentionResolvedFrom;
  confidence: number;
  labels: string[];
}

export interface MentionAliasConfig {
  label: string;
  nodeType: 'department' | 'role' | 'title';
  /** 组织节点（部门等），由后台配置 */
  targetNodeIds?: string[];
  /** 直接绑定 Agent UUID，由后台「提及别名」配置 */
  targetAgentIds?: string[];
  confidenceBoost?: number;
}
