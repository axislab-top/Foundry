export type ToolStatus = 'active' | 'disabled' | 'draft' | 'exception';
export type ToolRiskLevel = 'low' | 'medium' | 'high';
export type ToolType = 'builtin' | 'custom' | 'third_party' | 'plugin';

export type ToolRecord = {
  id: string;
  iconText: string;
  name: string;
  version: string;
  shortDescription: string;
  type: ToolType;
  status: ToolStatus;
  riskLevel: ToolRiskLevel;
  bindCount: number;
  lastUpdatedAt: string;
};
