export type McpToolStatus = 'active' | 'disabled' | 'draft' | 'exception';
export type McpTransportType = 'stdio' | 'sse' | 'http';
export type McpScopeType = 'company' | 'agent' | 'layer';
export type McpRiskLevel = 'low' | 'medium' | 'high';

export type McpToolRecord = {
  id: string;
  name: string;
  displayName: string;
  serverRef: string;
  endpointUrl?: string;
  version: string;
  description: string;
  transport: McpTransportType;
  scope: McpScopeType;
  status: McpToolStatus;
  riskLevel: McpRiskLevel;
  securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
  boundSkillCount: number;
  lastUpdatedAt: string;
};
