import { useEffect } from "react";
import { useOnboarding } from "@/features/onboarding/hooks/useOnboarding";
import type { OnboardingStepId } from "@/features/onboarding/types";

/** 进入页面时自动标记对应新手任务完成 */
export function useOnboardingStepOnVisit(stepId: OnboardingStepId) {
  const { enabled, hydrated, isStepComplete, markStepComplete } = useOnboarding();

  useEffect(() => {
    if (!enabled || !hydrated) return;
    if (!isStepComplete(stepId)) {
      markStepComplete(stepId);
    }
  }, [enabled, hydrated, isStepComplete, markStepComplete, stepId]);
}
