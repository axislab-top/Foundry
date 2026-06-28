/**
 * P17：与 Runner `SkillSecurityProfile` 对齐的档位解析（API 侧绑定门闸，无 `@foundry/runner` 依赖）。
 */
const PROFILE_ORDER = ['safe', 'fs-write', 'network', 'shell', 'dangerous'] as const;
export type DeclaredSkillSecurityProfile = (typeof PROFILE_ORDER)[number];

const PROFILE_SET = new Set<string>(PROFILE_ORDER);

/** 绑定前须走 ApprovalRequest（`actionType: skill.binding`）的档位。 */
export const SKILL_BINDING_APPROVAL_PROFILES: ReadonlySet<string> = new Set([
  'network',
  'shell',
  'dangerous',
]);

export function normalizeSkillSecurityProfileForBinding(raw?: string | null): DeclaredSkillSecurityProfile {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return 'safe';
  if (s === 'restricted') return 'network';
  if (PROFILE_SET.has(s)) return s as DeclaredSkillSecurityProfile;
  return 'safe';
}

export function effectiveSecurityProfileForBinding(
  revision: { metadata?: Record<string, unknown> | null } | null | undefined,
  skillName: string,
  skillSecurityProfile?: string | null,
): DeclaredSkillSecurityProfile {
  const fromSkill = normalizeSkillSecurityProfileForBinding(skillSecurityProfile ?? null);
  // If the Skill row explicitly declares a non-safe profile, honor it.
  if (fromSkill !== 'safe') return fromSkill;
  const meta = revision?.metadata;
  if (meta && typeof meta === 'object') {
    const direct = meta['securityProfile'];
    if (typeof direct === 'string' && direct.trim()) {
      return normalizeSkillSecurityProfileForBinding(direct);
    }
    const runner = meta['runner'];
    if (runner && typeof runner === 'object' && !Array.isArray(runner)) {
      const rs = (runner as Record<string, unknown>)['securityProfile'];
      if (typeof rs === 'string' && rs.trim()) {
        return normalizeSkillSecurityProfileForBinding(rs);
      }
    }
  }
  const n = (skillName ?? '').trim().toLowerCase();
  if (n === 'code-run') return 'shell';
  if (n === 'http-request' || n === 'web-search' || n === 'browser-search') return 'network';
  return 'safe';
}

export function skillBindingRequiresApproval(profile: string): boolean {
  return SKILL_BINDING_APPROVAL_PROFILES.has(normalizeSkillSecurityProfileForBinding(profile));
}
