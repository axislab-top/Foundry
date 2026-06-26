import matter from 'gray-matter';
import type { ParsedSkillMd, SkillImplementationType, SkillMdFrontmatter } from './types.js';

function normalizeToolSchema(raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function coerceFrontmatter(data: Record<string, unknown>): SkillMdFrontmatter {
  const name = String(data.name ?? '').trim();
  const description = String(data.description ?? '').trim();
  const fm: SkillMdFrontmatter = {
    name,
    description,
  };
  if (data.license != null) fm.license = String(data.license);
  if (data.compatibility != null) fm.compatibility = String(data.compatibility);
  if (data['allowed-tools'] != null) fm['allowed-tools'] = String(data['allowed-tools']);
  if (data.category != null) fm.category = String(data.category);
  if (data.implementationType != null) {
    fm.implementationType = String(data.implementationType) as SkillImplementationType;
  }
  const toolSchema = normalizeToolSchema(data.toolSchema);
  if (toolSchema) fm.toolSchema = toolSchema;
  const metadata = normalizeMetadata(data.metadata);
  if (metadata) fm.metadata = metadata;
  if (data.promptTemplate != null) fm.promptTemplate = String(data.promptTemplate);
  if (data.displayName != null) fm.displayName = String(data.displayName);
  if (data.icon != null) fm.icon = String(data.icon);
  return fm;
}

/**
 * Parse SKILL.md (YAML frontmatter + Markdown body).
 * @throws Error when frontmatter delimiters are missing
 */
export function parseSkillMd(raw: string): ParsedSkillMd {
  const text = String(raw ?? '');
  if (!text.trim()) {
    throw new Error('SKILL.md content is empty');
  }
  const parsed = matter(text);
  const frontmatter = coerceFrontmatter((parsed.data ?? {}) as Record<string, unknown>);
  const body = String(parsed.content ?? '').trim();
  return { frontmatter, body };
}
