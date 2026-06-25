import { ONBOARDING_STORAGE_PREFIX } from "@/features/onboarding/constants";
import type { OnboardingProgress, OnboardingScope } from "@/features/onboarding/types";
import type { OnboardingRole } from "@/features/onboarding/types";

function storageKey(scope: OnboardingScope): string {
  return `${ONBOARDING_STORAGE_PREFIX}.${scope.userId}.${scope.companyId}`;
}

export function createEmptyProgress(role: OnboardingRole = "member"): OnboardingProgress {
  return {
    version: 1,
    role,
    steps: {},
    checklistDismissed: false,
    updatedAt: new Date().toISOString(),
  };
}

export function readLocalOnboardingProgress(scope: OnboardingScope): OnboardingProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingProgress;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalOnboardingProgress(scope: OnboardingScope, progress: OnboardingProgress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(progress));
  } catch {
    // ignore quota / private mode
  }
}

export async function fetchOnboardingProgress(
  scope: OnboardingScope,
  role?: OnboardingRole,
): Promise<OnboardingProgress> {
  const existing = readLocalOnboardingProgress(scope);
  if (existing) {
    if (role && existing.role === "member" && role === "owner") {
      const merged = { ...existing, role: "owner" as const, updatedAt: new Date().toISOString() };
      writeLocalOnboardingProgress(scope, merged);
      return merged;
    }
    return existing;
  }
  const fresh = createEmptyProgress(role ?? "member");
  writeLocalOnboardingProgress(scope, fresh);
  return fresh;
}

export async function saveOnboardingProgress(
  scope: OnboardingScope,
  progress: OnboardingProgress,
): Promise<OnboardingProgress> {
  const next = { ...progress, updatedAt: new Date().toISOString() };
  writeLocalOnboardingProgress(scope, next);
  return next;
}
