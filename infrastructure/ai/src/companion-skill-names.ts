import type { SkillToolSnapshot } from '@contracts/events';

/** Resolve companion skill names declared on a skill snapshot (SKILL.md metadata + handlerConfig). */
export function companionSkillNamesFromSnapshot(snap: SkillToolSnapshot): string[] {
  const names = new Set<string>();
  const hc = snap.handlerConfig as Record<string, unknown> | null | undefined;
  for (const x of Array.isArray(hc?.companionSkillNames) ? hc!.companionSkillNames : []) {
    const n = String(x ?? '').trim();
    if (n) names.add(n);
  }
  const meta = (snap as { metadata?: Record<string, unknown> | null }).metadata;
  if (meta && typeof meta === 'object') {
    for (const x of Array.isArray(meta.companionSkillNames) ? meta.companionSkillNames : []) {
      const n = String(x ?? '').trim();
      if (n) names.add(n);
    }
    const allowed = meta.allowedTools;
    if (typeof allowed === 'string') {
      for (const n of allowed.split(/\s+/).map((s) => s.trim()).filter(Boolean)) {
        names.add(n);
      }
    }
  }
  return [...names];
}
