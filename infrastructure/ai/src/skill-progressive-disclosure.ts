import type { SkillToolSnapshot } from '@contracts/events';

/** True when snapshot was built with Plan A binding arrays (may be empty). */
export function snapshotsIncludePlanABindings(snapshots: unknown[]): boolean {
  const list = Array.isArray(snapshots) ? snapshots : [];
  if (list.length === 0) return true;
  return list.some((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as { boundTools?: unknown; boundMcpTools?: unknown };
    return Array.isArray(s.boundTools) || Array.isArray(s.boundMcpTools);
  });
}

export type SkillCatalogEntry = {
  id: string;
  name: string;
  description: string;
  implementationType: string;
  category?: string[] | null;
};

export type SkillInstructionsPayload = {
  ok: true;
  kind: 'skill_instructions';
  skillName: string;
  instructions: string;
  boundTools: string[];
  boundMcpTools: string[];
  truncated: boolean;
  hint: string;
};

export function hasPromptBody(snap: Pick<SkillToolSnapshot, 'promptTemplate'>): boolean {
  return Boolean(String(snap.promptTemplate ?? '').trim());
}

/** Catalog-only description; never falls back to promptTemplate. */
export function skillCatalogDescription(
  snap: Pick<SkillToolSnapshot, 'description' | 'name'>,
): string {
  const desc = String(snap.description ?? '').trim();
  if (desc) return desc;
  return String(snap.name ?? '').trim() || 'skill';
}

export function toSkillCatalogEntry(snap: SkillToolSnapshot): SkillCatalogEntry {
  return {
    id: snap.id,
    name: snap.name,
    description: skillCatalogDescription(snap),
    implementationType: String(snap.implementationType ?? '').trim() || 'builtin',
    category: snap.category ?? null,
  };
}

export function applyPromptTemplateArgs(
  template: string,
  args?: Record<string, unknown> | null,
): string {
  if (!args || typeof args !== 'object') return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const v = args[key];
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  });
}

function listBoundToolNames(snap: SkillToolSnapshot): string[] {
  const out: string[] = [];
  const tools = (snap as { boundTools?: Array<{ name?: string }> }).boundTools;
  for (const t of Array.isArray(tools) ? tools : []) {
    const n = String(t?.name ?? '').trim();
    if (n) out.push(n);
  }
  const mcps = (snap as { boundMcpTools?: Array<{ name?: string }> }).boundMcpTools;
  for (const t of Array.isArray(mcps) ? mcps : []) {
    const n = String(t?.name ?? '').trim();
    if (n) out.push(n);
  }
  return out;
}

function truncateInstructions(text: string, snap: SkillToolSnapshot): { text: string; truncated: boolean } {
  let maxChars = 120_000;
  const maxBytes = snap.maxInputSizeBytes;
  if (typeof maxBytes === 'number' && maxBytes > 0) {
    maxChars = Math.min(maxChars, maxBytes);
  }
  const maxTokens = snap.maxOutputTokens;
  if (typeof maxTokens === 'number' && maxTokens > 0) {
    maxChars = Math.min(maxChars, maxTokens * 4);
  }
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: text.slice(0, maxChars) + '\n\n[truncated: skill instructions exceeded governance limit]',
    truncated: true,
  };
}

export function shouldExpandOnSkillNameCall(
  snap: SkillToolSnapshot,
  options?: { progressiveDisclosure?: boolean },
): boolean {
  if (options?.progressiveDisclosure === false) return false;
  return hasPromptBody(snap);
}

export function buildSkillInstructionsPayload(
  snap: SkillToolSnapshot,
  args?: Record<string, unknown> | null,
): SkillInstructionsPayload {
  const skillName = String(snap.name ?? '').trim();
  const raw = applyPromptTemplateArgs(String(snap.promptTemplate ?? '').trim(), args);
  const { text: instructions, truncated } = truncateInstructions(raw, snap);
  const bound = listBoundToolNames(snap);
  const boundTools = bound.filter((n) => n.startsWith('tool.'));
  const boundMcpTools = bound.filter((n) => n.startsWith('mcp.'));
  return {
    ok: true,
    kind: 'skill_instructions',
    skillName,
    instructions,
    boundTools,
    boundMcpTools,
    truncated,
    hint:
      'Follow these skill instructions for the remainder of this task. Use boundTools / boundMcpTools for executable steps.',
  };
}

/** Legacy tool description when progressive disclosure is disabled. */
export function legacySkillFunctionDescription(snap: SkillToolSnapshot): string {
  return (snap.description ?? snap.promptTemplate ?? snap.name ?? 'skill').slice(0, 4000);
}
