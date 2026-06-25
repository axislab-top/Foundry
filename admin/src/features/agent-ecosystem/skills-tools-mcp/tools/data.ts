import type { ApiToolRecord } from './api';
import type { ToolRecord, ToolRiskLevel, ToolStatus, ToolType } from './types';

export const TOOL_STATUS_TAG: Record<ToolStatus, { color: string; label: string }> = {
  active: { color: 'success', label: 'Active' },
  disabled: { color: 'default', label: 'Disabled' },
  draft: { color: 'processing', label: 'Draft' },
  exception: { color: 'error', label: 'Exception' }
};

export const TOOL_RISK_TAG: Record<ToolRiskLevel, { color: string; label: string }> = {
  low: { color: 'success', label: 'Low' },
  medium: { color: 'warning', label: 'Medium' },
  high: { color: 'error', label: 'High' }
};

export const TOOL_TYPE_LABEL: Record<ToolType, string> = {
  builtin: 'Built-in',
  custom: 'Custom',
  third_party: 'Third-party',
  plugin: 'Plugin'
};

export const TOOL_TYPE_OPTIONS = Object.keys(TOOL_TYPE_LABEL) as ToolType[];

export const mockTools: Array<ToolRecord & { [key: string]: unknown }> = [
  {
    id: 'tool-http-client',
    iconText: 'H',
    name: 'HTTP Client',
    version: '1.7.4',
    shortDescription: 'Send policy-compliant HTTP requests for read-only and integration workflows.',
    owner: 'platform-admin@foundry.io',
    tags: ['network', 'integration'],
    type: 'builtin',
    status: 'active',
    riskLevel: 'medium',
    bindCount: 26,
    dailyCalls: 12450,
    successRate: 99.2,
    lastUpdatedAt: '2026-04-23'
  },
  {
    id: 'tool-web-search',
    iconText: 'W',
    name: 'Web Search',
    version: '2.3.1',
    shortDescription: 'Query external web sources and return snippets with source links.',
    owner: 'search-team@foundry.io',
    tags: ['search', 'knowledge'],
    type: 'third_party',
    status: 'active',
    riskLevel: 'low',
    bindCount: 39,
    dailyCalls: 23800,
    successRate: 98.7,
    lastUpdatedAt: '2026-04-25'
  },
  {
    id: 'tool-sql-runner',
    iconText: 'S',
    name: 'SQL Runner',
    version: '0.9.6',
    shortDescription: 'Execute guarded SQL templates against approved data sources.',
    owner: 'data-governance@foundry.io',
    tags: ['database', 'analytics'],
    type: 'custom',
    status: 'draft',
    riskLevel: 'high',
    bindCount: 8,
    dailyCalls: 890,
    successRate: 96.1,
    lastUpdatedAt: '2026-04-19'
  },
  {
    id: 'tool-email-dispatch',
    iconText: 'E',
    name: 'Email Dispatch',
    version: '1.1.2',
    shortDescription: 'Deliver templated email content with sender policy checks.',
    owner: 'growth-ops@foundry.io',
    tags: ['communication'],
    type: 'plugin',
    status: 'disabled',
    riskLevel: 'medium',
    bindCount: 11,
    dailyCalls: 1120,
    successRate: 97.5,
    lastUpdatedAt: '2026-04-17'
  },
  {
    id: 'tool-file-manager',
    iconText: 'F',
    name: 'File Manager',
    version: '1.0.8',
    shortDescription: 'Manage scoped workspace files with strict path restrictions.',
    owner: 'security@foundry.io',
    tags: ['filesystem', 'security'],
    type: 'builtin',
    status: 'exception',
    riskLevel: 'high',
    bindCount: 14,
    dailyCalls: 3420,
    successRate: 91.8,
    lastUpdatedAt: '2026-04-26'
  }
];

function toType(value: string | null | undefined): ToolType {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'builtin') return 'builtin';
  if (normalized === 'external') return 'third_party';
  if (normalized === 'api') return 'plugin';
  return 'custom';
}

function toStatus(input: ApiToolRecord): ToolStatus {
  if (!input.isEnabled) return 'draft';
  if (input.approvalStatus === 'rejected') return 'disabled';
  if (input.approvalStatus === 'pending') return 'exception';
  return 'active';
}

function toRiskLevel(profile: string | null | undefined): ToolRiskLevel {
  if (profile === 'dangerous' || profile === 'shell') return 'high';
  if (profile === 'network' || profile === 'fs-write') return 'medium';
  return 'low';
}

function dateText(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

export function mapApiToolToCard(input: ApiToolRecord): ToolRecord {
  return {
    id: input.id,
    iconText: String(input.displayName ?? input.name ?? 'T').slice(0, 1).toUpperCase(),
    name: String(input.displayName ?? input.name ?? 'Unknown Tool'),
    version: String(input.semverVersion ?? input.version ?? '1.0.0'),
    shortDescription: String(input.description ?? 'No description'),
    type: toType(input.implementationType),
    status: toStatus(input),
    riskLevel: toRiskLevel(input.securityProfile),
    bindCount: Number(input.boundSkillCount ?? 0),
    lastUpdatedAt: dateText(input.updatedAt)
  };
}
