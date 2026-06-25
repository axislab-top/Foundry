import { create } from "zustand";
import {
  fetchOnboardingProgress,
  saveOnboardingProgress,
} from "@/features/onboarding/api/onboardingApi";
import type {
  OnboardingProgress,
  OnboardingRole,
  OnboardingScope,
  OnboardingStepId,
} from "@/features/onboarding/types";

type OnboardingStore = {
  hydrated: boolean;
  scope: OnboardingScope | null;
  progress: OnboardingProgress | null;

  loadForCompany: (scope: OnboardingScope, role?: OnboardingRole) => Promise<void>;
  completeStep: (stepId: OnboardingStepId, opts?: { skipped?: boolean }) => void;
  isStepDone: (stepId: OnboardingStepId) => boolean;
  dismissChecklist: () => void;
  resetForDev: () => void;
};

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  hydrated: false,
  scope: null,
  progress: null,

  loadForCompany: async (scope, role) => {
    const progress = await fetchOnboardingProgress(scope, role);
    set({ scope, progress, hydrated: true });
  },

  completeStep: (stepId, opts) => {
    const { scope, progress } = get();
    if (!scope || !progress) return;
    if (progress.steps[stepId]?.completedAt) return;

    const next: OnboardingProgress = {
      ...progress,
      steps: {
        ...progress.steps,
        [stepId]: {
          completedAt: new Date().toISOString(),
          ...(opts?.skipped ? { skipped: true } : {}),
        },
      },
    };

    void saveOnboardingProgress(scope, next).then((saved) => {
      set({ progress: saved });
    });
  },

  isStepDone: (stepId) => {
    const { progress } = get();
    return Boolean(progress?.steps[stepId]?.completedAt);
  },

  dismissChecklist: () => {
    const { scope, progress } = get();
    if (!scope || !progress) return;

    const next: OnboardingProgress = {
      ...progress,
      checklistDismissed: true,
    };

    void saveOnboardingProgress(scope, next).then((saved) => {
      set({ progress: saved });
    });
  },

  resetForDev: () => {
    const { scope } = get();
    if (!scope || typeof window === "undefined") return;
    try {
      localStorage.removeItem(`foundry.onboarding.v1.${scope.userId}.${scope.companyId}`);
    } catch {
      // ignore
    }
    set({ progress: null, hydrated: false });
    void get().loadForCompany(scope);
  },
}));
