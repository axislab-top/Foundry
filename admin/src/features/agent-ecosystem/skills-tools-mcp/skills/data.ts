import type { ApiSkillDetail, ApiSkillRecord } from './api';
import { defaultSkillMdTemplate } from './skillMdTemplate.js';
import type { RiskLevel, Skill, SkillDetailDraft, SkillStatus } from './types';

export const STATUS_TAG: Record<SkillStatus, { color: string; label: string }> = {
  active: { color: 'success', label: 'Active' },
  draft: { color: 'default', label: 'Draft' },
  deprecated: { color: 'warning', label: 'Deprecated' },
  in_review: { color: 'processing', label: 'In Review' }
};

export const RISK_TAG: Record<RiskLevel, { color: string; label: string }> = {
  low: { color: 'success', label: 'Low' },
  medium: { color: 'warning', label: 'Medium' },
  high: { color: 'error', label: 'High' }
};

export const CATEGORY_OPTIONS = ['Marketing', 'Engineering', 'Finance', 'General', 'Legal', 'HR'] as const;
export const DEPARTMENT_OPTIONS = [
  '全公司',
  'Sales',
  'Marketing',
  'Engineering',
  'Finance',
  'Legal',
  'Operations'
] as const;
export const TARGET_SCOPE_OPTIONS = ['Org', 'Department', 'Project', 'Agent Type', 'Global'] as const;

export const TOOL_LIBRARY = [
  { id: 'tool-1', name: 'http-client', version: '1.3.0' },
  { id: 'tool-2', name: 'web-search', version: '2.0.2' },
  { id: 'tool-3', name: 'sql-runner', version: '1.1.8' },
  { id: 'tool-4', name: 'vector-index', version: '0.7.1' },
  { id: 'tool-5', name: 'email-dispatch', version: '1.0.4' }
] as const;

export const MCP_TOOL_LIBRARY = [
  { id: 'mcp-1', name: 'notion-mcp', version: '0.5.3' },
  { id: 'mcp-2', name: 'slack-mcp', version: '1.2.1' },
  { id: 'mcp-3', name: 'github-mcp', version: '0.9.7' },
  { id: 'mcp-4', name: 'figma-mcp', version: '0.2.9' }
] as const;

export const mockSkills: Skill[] = [
  {
    id: 'sk-1',
    iconText: 'S',
    name: 'Sales Outreach Writer',
    version: '1.4.2',
    shortDescription: 'Generate personalized outbound emails with company context and compliant tone guidelines.',
    category: 'Marketing',
    departments: ['Sales', 'Marketing'],
    status: 'active',
    riskLevel: 'low',
    bindingAgents: 12,
    bindingTools: 2,
    bindingMcpTools: 1,
    monthlyCalls: 18240,
    monthlyTokens: 9100000,
    createdBy: 'platform-admin@foundry.io',
    lastUpdatedAt: '2026-04-18',
    createdAt: '2026-01-09',
    monthlyCostUsd: 820.5,
    riskScore: 12
  },
  {
    id: 'sk-2',
    iconText: 'C',
    name: 'Code Review Guardrails',
    version: '0.9.0',
    shortDescription: 'Static checks for prompt safety, data boundaries, and policy-aligned tool usage before merge.',
    category: 'Engineering',
    departments: ['Engineering'],
    status: 'in_review',
    riskLevel: 'medium',
    bindingAgents: 5,
    bindingTools: 3,
    bindingMcpTools: 4,
    monthlyCalls: 4200,
    monthlyTokens: 2600000,
    createdBy: 'eng-admin@foundry.io',
    lastUpdatedAt: '2026-04-22',
    createdAt: '2026-03-01',
    monthlyCostUsd: 312.2,
    riskScore: 58
  },
  {
    id: 'sk-3',
    iconText: 'E',
    name: 'Expense Policy QA',
    version: '2.1.0',
    shortDescription: 'Validate expense submissions against policy, flag anomalies, and produce auditor-ready summaries.',
    category: 'Finance',
    departments: ['Finance', 'Operations'],
    status: 'active',
    riskLevel: 'medium',
    bindingAgents: 20,
    bindingTools: 1,
    bindingMcpTools: 0,
    monthlyCalls: 7600,
    monthlyTokens: 5400000,
    createdBy: 'partner-fin@foundry.io',
    lastUpdatedAt: '2026-04-02',
    createdAt: '2025-11-19',
    monthlyCostUsd: 640.0,
    riskScore: 42
  },
  {
    id: 'sk-4',
    iconText: 'L',
    name: 'Contract Clause Extractor',
    version: '1.0.3',
    shortDescription: 'Extract key clauses, obligations, and renewal terms from contracts with traceable citations.',
    category: 'Legal',
    departments: ['Legal'],
    status: 'deprecated',
    riskLevel: 'high',
    bindingAgents: 2,
    bindingTools: 0,
    bindingMcpTools: 0,
    monthlyCalls: 410,
    monthlyTokens: 380000,
    createdBy: 'platform-admin@foundry.io',
    lastUpdatedAt: '2026-02-10',
    createdAt: '2025-08-15',
    monthlyCostUsd: 55.4,
    riskScore: 91
  }
];

function toStatus(skill: ApiSkillRecord): SkillStatus {
  if (!skill.isEnabled) return 'draft';
  if (skill.approvalStatus === 'rejected') return 'deprecated';
  if (skill.approvalStatus === 'pending') return 'in_review';
  return 'active';
}

function toRiskLevel(skill: ApiSkillRecord): RiskLevel {
  const profile = String(skill.securityProfile ?? 'safe');
  if (profile === 'dangerous' || profile === 'shell') return 'high';
  if (profile === 'network' || profile === 'fs-write') return 'medium';
  return 'low';
}

function toDateText(value: string | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

export function mapApiSkillToCard(skill: ApiSkillRecord): Skill {
  const tags = skill.category ?? [];
  const departments = ['全公司'];
  return {
    id: skill.id,
    iconText: String(skill.icon ?? skill.displayName ?? skill.name ?? 'S').slice(0, 1).toUpperCase(),
    name: String(skill.displayName ?? skill.name ?? 'Unnamed Skill'),
    version: String(skill.semverVersion ?? skill.version ?? '1.0.0'),
    shortDescription: String(skill.description ?? 'No description'),
    category: tags[0] ?? 'General',
    departments,
    status: toStatus(skill),
    riskLevel: toRiskLevel(skill),
    bindingAgents: 0,
    bindingTools: 0,
    bindingMcpTools: 0,
    monthlyCalls: 0,
    monthlyTokens: 0,
    createdBy: String(skill.createdBy ?? 'unknown'),
    lastUpdatedAt: toDateText(skill.updatedAt),
    createdAt: toDateText(skill.createdAt),
    monthlyCostUsd: 0,
    riskScore: toRiskLevel(skill) === 'high' ? 80 : toRiskLevel(skill) === 'medium' ? 50 : 20
  };
}

export const createDefaultDetailDraft = (_skill: Skill): SkillDetailDraft => ({
  skillMd: defaultSkillMdTemplate(),
  statusBadge: 'Draft',
  changeReason: 'Update skill from Skills admin page',
  boundTools: [],
  boundMcpTools: []
});

export function createDetailDraftFromApi(detail: ApiSkillDetail): SkillDetailDraft {
  const skill = detail.skill;
  const mapped = mapApiSkillToCard(skill);
  const base = createDefaultDetailDraft(mapped);
  const boundTools = (detail.toolBindings ?? [])
    .filter((b) => b.tool)
    .map((b) => ({
      id: String(b.toolId),
      name: String(b.tool!.displayName ?? b.tool!.name),
      version: String(b.tool!.semverVersion ?? b.tool!.version ?? '1.0.0'),
      overridden: !!b.isOverridden
    }));
  const boundMcpTools = (detail.mcpToolBindings ?? [])
    .filter((b) => b.mcpTool)
    .map((b) => ({
      id: String(b.mcpToolId),
      name: String(b.mcpTool!.displayName ?? b.mcpTool!.name),
      version: String(b.mcpTool!.semverVersion ?? b.mcpTool!.version ?? '1.0.0'),
      overridden: !!b.isOverridden
    }));
  const skillMd =
    typeof detail.skillMd === 'string' && detail.skillMd.trim()
      ? detail.skillMd
      : defaultSkillMdTemplate(String(skill.name ?? 'skill'));
  return {
    ...base,
    skillMd,
    changeReason: base.changeReason,
    statusBadge: !skill.isEnabled ? 'Draft' : skill.approvalStatus === 'rejected' ? 'Deprecated' : 'Active',
    boundTools,
    boundMcpTools
  };
}
