import type { SkillMdFrontmatter, SkillMdValidationIssue } from './types.js';

const NAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function validateSkillName(name: string): SkillMdValidationIssue[] {
  const n = String(name ?? '').trim();
  const issues: SkillMdValidationIssue[] = [];
  if (!n) {
    issues.push({ field: 'name', message: 'name is required' });
    return issues;
  }
  if (n.length > 64) {
    issues.push({ field: 'name', message: 'name must be at most 64 characters' });
  }
  if (!NAME_RE.test(n)) {
    issues.push({
      field: 'name',
      message: 'name must be lowercase alphanumeric with single hyphens (AgentSkills)',
    });
  }
  if (n.includes('--')) {
    issues.push({ field: 'name', message: 'name must not contain consecutive hyphens' });
  }
  return issues;
}

export function validateSkillMdFrontmatter(fm: SkillMdFrontmatter): SkillMdValidationIssue[] {
  const issues = validateSkillName(fm.name);
  const desc = String(fm.description ?? '').trim();
  if (!desc) {
    issues.push({ field: 'description', message: 'description is required' });
  } else if (desc.length > 1024) {
    issues.push({ field: 'description', message: 'description must be at most 1024 characters' });
  }
  if (fm.compatibility && String(fm.compatibility).length > 500) {
    issues.push({ field: 'compatibility', message: 'compatibility must be at most 500 characters' });
  }
  const impl = String(fm.implementationType ?? 'prompt').trim();
  const allowed = ['prompt', 'builtin', 'langgraph', 'api', 'external', 'mcp'];
  if (impl && !allowed.includes(impl)) {
    issues.push({ field: 'implementationType', message: `implementationType must be one of: ${allowed.join(', ')}` });
  }
  return issues;
}
