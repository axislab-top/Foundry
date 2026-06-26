import type { SkillToolSnapshot } from '@contracts/events';

/**
 * Skill metadata may declare required toolsets (GitOps / Admin handlerConfig.metadata).
 * Empty required list = skill is always eligible when toolsets are enabled for the company.
 */
export function readSkillRequiredToolsets(snap: SkillToolSnapshot): string[] {
  const hc = (snap.handlerConfig ?? null) as Record<string, unknown> | null;
  const meta =
    hc && typeof hc.metadata === 'object' && hc.metadata && !Array.isArray(hc.metadata)
      ? (hc.metadata as Record<string, unknown>)
      : null;
  const raw =
    meta?.requiresToolsets ??
    meta?.requires_toolsets ??
    meta?.toolsets ??
    (snap as { requiresToolsets?: unknown }).requiresToolsets;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))];
}

/**
 * When `enabledToolsets` is non-empty, only skills with no requirement or overlapping toolsets pass.
 * When empty, all snapshots pass (toolsets feature disabled).
 */
export function filterSnapshotsByToolsets(
  snapshots: SkillToolSnapshot[],
  enabledToolsets: string[],
): SkillToolSnapshot[] {
  const enabled = new Set(
    (Array.isArray(enabledToolsets) ? enabledToolsets : [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean),
  );
  if (!enabled.size) return Array.isArray(snapshots) ? snapshots : [];
  return (Array.isArray(snapshots) ? snapshots : []).filter((snap) => {
    const required = readSkillRequiredToolsets(snap);
    if (!required.length) return true;
    return required.some((t) => enabled.has(t));
  });
}
