import { useCallback, useEffect, useMemo, useState } from "react";
import {
  emptyOrganizationDraft,
  WIZARD_STORAGE_KEY,
  type OrganizationDraft,
  type WizardBasicInfo,
  type WizardPersistedState,
  type WizardStep,
} from "@/features/company-wizard/types/organizationDraft";

function normalizeWizardStep(step: number | undefined): WizardStep {
  if (step === 2) return 2;
  if (step === 3 || step === 4) return 3;
  return 1;
}

function readPersistedState(): WizardPersistedState | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardPersistedState & { step?: number };
    return {
      ...parsed,
      step: normalizeWizardStep(parsed.step),
    };
  } catch {
    return null;
  }
}

function writePersistedState(state: WizardPersistedState) {
  sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
}

export function clearWizardPersistedState() {
  sessionStorage.removeItem(WIZARD_STORAGE_KEY);
}

export function useCompanyWizard() {
  const persisted = useMemo(() => readPersistedState(), []);
  const [step, setStep] = useState<WizardStep>(persisted?.step ?? 1);
  const [draftCompanyId, setDraftCompanyId] = useState<string | null>(persisted?.draftCompanyId ?? null);
  const [basicInfo, setBasicInfo] = useState<WizardBasicInfo | null>(persisted?.basicInfo ?? null);
  const [organizationDraft, setOrganizationDraft] = useState<OrganizationDraft>(
    persisted?.organizationDraft ?? emptyOrganizationDraft(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    writePersistedState({
      draftCompanyId,
      step,
      basicInfo,
      organizationDraft,
    });
  }, [draftCompanyId, step, basicInfo, organizationDraft]);

  const goToStep = useCallback((next: WizardStep) => {
    setError(null);
    setStep(next);
  }, []);

  const resetWizard = useCallback(() => {
    clearWizardPersistedState();
    setStep(1);
    setDraftCompanyId(null);
    setBasicInfo(null);
    setOrganizationDraft(emptyOrganizationDraft());
    setError(null);
  }, []);

  return {
    step,
    draftCompanyId,
    basicInfo,
    organizationDraft,
    error,
    setError,
    setDraftCompanyId,
    setBasicInfo,
    setOrganizationDraft,
    goToStep,
    resetWizard,
  };
}
