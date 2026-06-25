import { useCallback, useMemo } from "react";
import {
  countRequiredCompleted,
  countRequiredTotal,
  getChecklistTasksForRole,
} from "@/features/onboarding/constants";
import { useOnboardingStore } from "@/features/onboarding/store/onboardingStore";
import type { OnboardingRole, OnboardingStepId } from "@/features/onboarding/types";
import { isOnboardingEnabled } from "@/shared/config/env";

export function useOnboarding() {
  const hydrated = useOnboardingStore((s) => s.hydrated);
  const progress = useOnboardingStore((s) => s.progress);
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const isStepDone = useOnboardingStore((s) => s.isStepDone);
  const dismissChecklist = useOnboardingStore((s) => s.dismissChecklist);

  const enabled = isOnboardingEnabled();
  const role: OnboardingRole = progress?.role ?? "member";

  const checklistTasks = useMemo(() => getChecklistTasksForRole(role), [role]);

  const requiredCompleted = useMemo(
    () => (progress ? countRequiredCompleted(progress.steps, role) : 0),
    [progress, role],
  );

  const requiredTotal = useMemo(() => countRequiredTotal(role), [role]);

  const allRequiredDone = requiredCompleted >= requiredTotal && requiredTotal > 0;

  const isStepComplete = useCallback(
    (stepId: OnboardingStepId) => isStepDone(stepId),
    [isStepDone],
  );

  const markStepComplete = useCallback(
    (stepId: OnboardingStepId, opts?: { skipped?: boolean }) => {
      if (!enabled) return;
      completeStep(stepId, opts);
    },
    [completeStep, enabled],
  );

  return {
    enabled,
    hydrated,
    progress,
    role,
    checklistTasks,
    requiredCompleted,
    requiredTotal,
    allRequiredDone,
    checklistDismissed: progress?.checklistDismissed ?? false,
    isStepComplete,
    markStepComplete,
    dismissChecklist,
  };
}
