import type { ParsedSkillMd, SkillMdDbPayload, SkillRowLike } from './types.js';
import { parseSkillMd } from './parse.js';
import { serializeSkillMd } from './serialize.js';
import { validateSkillMdFrontmatter } from './validate.js';

const IMPL_TYPES = new Set(['prompt', 'builtin', 'langgraph', 'api', 'external', 'mcp']);

function normalizeImplementationType(raw: unknown): SkillMdDbPayload['implementationType'] {
  const v = String(raw ?? 'prompt').trim();
  return IMPL_TYPES.has(v) ? (v as SkillMdDbPayload['implementationType']) : 'prompt';
}

function categoryToArray(category: string | undefined | null): string[] | null {
  const c = String(category ?? '').trim();
  if (!c) return null;
  return [c];
}

/**
 * Map parsed SKILL.md → DB/API fields.
 * Body → prompt_template; frontmatter.description stays short summary.
 */
export function skillMdToDbPayload(
  parsed: ParsedSkillMd,
  options?: { mergeMetadata?: Record<string, unknown> },
): SkillMdDbPayload {
  const fm = parsed.frontmatter;
  const body = parsed.body.trim();
  const promptTemplate = body || String(fm.promptTemplate ?? '').trim();
  const toolSchema =
    fm.toolSchema && typeof fm.toolSchema === 'object' ? fm.toolSchema : { type: 'object', properties: {} };
  const metadata: Record<string, unknown> = {
    ...(fm.metadata && typeof fm.metadata === 'object' ? fm.metadata : {}),
    ...(options?.mergeMetadata ?? {}),
    source: 'skill-md',
  };
  if (fm.license) metadata.license = fm.license;
  if (fm.compatibility) metadata.compatibility = fm.compatibility;
  if (fm['allowed-tools']) metadata.allowedTools = fm['allowed-tools'];

  const displayName =
    String(fm.displayName ?? '').trim() ||
    fm.name
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  return {
    name: fm.name,
    displayName,
    description: fm.description,
    promptTemplate,
    implementationType: normalizeImplementationType(fm.implementationType),
    toolSchema,
    inputSchema: toolSchema,
    category: categoryToArray(fm.category),
    icon: fm.icon?.trim() || null,
    metadata,
  };
}

export function parseSkillMdToDbPayload(
  raw: string,
  options?: { mergeMetadata?: Record<string, unknown> },
): { payload: SkillMdDbPayload; parsed: ParsedSkillMd } {
  const parsed = parseSkillMd(raw);
  const issues = validateSkillMdFrontmatter(parsed.frontmatter);
  if (issues.length) {
    throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
  }
  if (!parsed.body.trim() && !parsed.frontmatter.promptTemplate?.trim()) {
    throw new Error('body: SKILL.md body (instructions) is required');
  }
  return { payload: skillMdToDbPayload(parsed, options), parsed };
}

/** Reconstruct SKILL.md from a DB row for Admin export/edit. */
export function skillRowToSkillMd(row: SkillRowLike): string {
  const metadata = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  delete metadata.source;

  const fm: ParsedSkillMd['frontmatter'] = {
    name: row.name,
    description: String(row.description ?? ''),
    category: row.category?.[0] ?? undefined,
    implementationType: normalizeImplementationType(row.implementationType),
    toolSchema:
      (row.toolSchema ?? row.inputSchema) && typeof (row.toolSchema ?? row.inputSchema) === 'object'
        ? (row.toolSchema ?? row.inputSchema)!
        : { type: 'object', properties: {} },
    metadata: Object.keys(metadata).length ? metadata : undefined,
    displayName: row.displayName ?? undefined,
    icon: row.icon ?? undefined,
  };
  if (metadata.license) fm.license = String(metadata.license);
  if (metadata.compatibility) fm.compatibility = String(metadata.compatibility);
  if (metadata.allowedTools) fm['allowed-tools'] = String(metadata.allowedTools);

  return serializeSkillMd({
    frontmatter: fm,
    body: String(row.promptTemplate ?? '').trim(),
  });
}
