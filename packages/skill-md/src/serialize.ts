import matter from 'gray-matter';
import type { ParsedSkillMd, SkillMdFrontmatter } from './types.js';

function frontmatterToData(fm: SkillMdFrontmatter): Record<string, unknown> {
  const data: Record<string, unknown> = {
    name: fm.name,
    description: fm.description,
  };
  if (fm.license) data.license = fm.license;
  if (fm.compatibility) data.compatibility = fm.compatibility;
  if (fm['allowed-tools']) data['allowed-tools'] = fm['allowed-tools'];
  if (fm.category) data.category = fm.category;
  if (fm.implementationType && fm.implementationType !== 'prompt') {
    data.implementationType = fm.implementationType;
  }
  if (fm.toolSchema && Object.keys(fm.toolSchema).length > 0) {
    data.toolSchema = fm.toolSchema;
  }
  if (fm.metadata && Object.keys(fm.metadata).length > 0) {
    data.metadata = fm.metadata;
  }
  if (fm.icon) data.icon = fm.icon;
  return data;
}

/** Serialize to standard SKILL.md text. */
export function serializeSkillMd(parsed: ParsedSkillMd): string {
  const content = parsed.body.trim();
  return matter.stringify(content ? `${content}\n` : '', frontmatterToData(parsed.frontmatter));
}

/** Default template for new skills (AgentSkills-style). */
export function defaultSkillMdTemplate(name = 'my-skill'): string {
  return serializeSkillMd({
    frontmatter: {
      name,
      description: 'Describe what this skill does and when the agent should use it.',
      category: 'General',
      implementationType: 'prompt',
      toolSchema: { type: 'object', properties: {} },
    },
    body: [
      '# ' + name,
      '',
      '## 何时使用',
      '',
      '- （列出触发场景）',
      '',
      '## 步骤',
      '',
      '1. …',
      '',
      '## 输出格式',
      '',
      '- …',
      '',
      '## 边界',
      '',
      '- …',
    ].join('\n'),
  });
}
