import type { McpRiskLevel, McpScopeType, McpToolRecord, McpToolStatus, McpTransportType } from './types';

export const MCP_STATUS_TAG: Record<McpToolStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'success' },
  disabled: { label: 'Disabled', color: 'default' },
  draft: { label: 'Draft', color: 'processing' },
  exception: { label: 'Exception', color: 'error' }
};

export const MCP_RISK_TAG: Record<McpRiskLevel, { label: string; color: string }> = {
  low: { label: 'Low', color: 'success' },
  medium: { label: 'Medium', color: 'warning' },
  high: { label: 'High', color: 'error' }
};

export const MCP_SCOPE_LABEL: Record<McpScopeType, string> = {
  company: 'Company',
  agent: 'Agent',
  layer: 'Layer'
};

export const MCP_TRANSPORT_LABEL: Record<McpTransportType, string> = {
  stdio: 'STDIO',
  sse: 'SSE',
  http: 'HTTP'
};

export const mockMcpTools: McpToolRecord[] = [
  {
    id: 'mcp-github-repo-reader',
    name: 'github_repo_reader',
    displayName: 'GitHub Repo Reader',
    serverRef: 'github-mcp',
    endpointUrl: 'https://mcp.github.local/sse',
    version: '1.2.0',
    description: 'Read repository files and metadata through GitHub MCP server.',
    transport: 'sse',
    scope: 'company',
    status: 'active',
    riskLevel: 'medium',
    securityProfile: 'network',
    boundSkillCount: 16,
    lastUpdatedAt: '2026-04-25'
  },
  {
    id: 'mcp-notion-sync',
    name: 'notion_sync',
    displayName: 'Notion Sync',
    serverRef: 'notion-mcp',
    endpointUrl: '',
    version: '0.8.4',
    description: 'Sync and query Notion pages for knowledge workflows.',
    transport: 'stdio',
    scope: 'agent',
    status: 'active',
    riskLevel: 'low',
    securityProfile: 'safe',
    boundSkillCount: 9,
    lastUpdatedAt: '2026-04-20'
  },
  {
    id: 'mcp-shell-runner',
    name: 'secure_shell_runner',
    displayName: 'Secure Shell Runner',
    serverRef: 'shell-mcp',
    endpointUrl: 'http://shell-mcp.internal/api',
    version: '0.5.2',
    description: 'Run guarded shell commands in controlled runtime.',
    transport: 'http',
    scope: 'layer',
    status: 'draft',
    riskLevel: 'high',
    securityProfile: 'shell',
    boundSkillCount: 3,
    lastUpdatedAt: '2026-04-18'
  }
];
