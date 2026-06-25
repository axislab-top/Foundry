import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  completeCompanyWizard,
  createCompanyDraft,
} from "@/features/company-wizard/api/companyWizardApi";
import { fetchCompanyById } from "@/features/auth/api/companiesApi";
import { useCompanyCreationQuota } from "@/features/auth/hooks/useCompanyCreationQuota";
import BootstrapOverlay from "@/features/company-wizard/components/BootstrapOverlay";
import WizardStepper from "@/features/company-wizard/components/WizardStepper";
import { WizardErrorBanner, WizardShell } from "@/features/company-wizard/components/WizardShell";
import { clearWizardPersistedState, useCompanyWizard } from "@/features/company-wizard/hooks/useCompanyWizard";
import BasicInfoStep from "@/features/company-wizard/steps/BasicInfoStep";
import ConfirmStep from "@/features/company-wizard/steps/ConfirmStep";
import TemplateRecommendStep from "@/features/company-wizard/steps/TemplateRecommendStep";
import styles from "@/features/company-wizard/CompanyWizard.module.css";
import { pollListRoomsUntilMain } from "@/features/collaboration/chats/utils/waitForMainRoom";
import { CompanyFoundedModal, useOnboardingStore } from "@/features/onboarding";
import { extractApiError } from "@/shared/api/extractApiError";
import { decodeJwtPayload } from "@/shared/auth/decodeJwtPayload";
import { isCompanyWizardEnabled, isOnboardingEnabled } from "@/shared/config/env";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";

type FoundedSummary = {
  companyId: string;
  companyName: string;
  deptCount: number;
  agentCount: number;
};

export default function CompanyWizardPage() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setActiveCompany = useCompanyStore((s) => s.setActiveCompany);
  const loadForCompany = useOnboardingStore((s) => s.loadForCompany);
  const completeStep = useOnboardingStore((s) => s.completeStep);
  const wizard = useCompanyWizard();
  const quotaQuery = useCompanyCreationQuota(isCompanyWizardEnabled());
  const [draftLoading, setDraftLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [bootstrapIndex, setBootstrapIndex] = useState<number | null>(null);
  const [foundedSummary, setFoundedSummary] = useState<FoundedSummary | null>(null);

  if (!isCompanyWizardEnabled()) {
    return (
      <div className={styles.disabledPage}>
        <div className={styles.disabledCard}>
          <p className={styles.stepDesc}>新建公司向导当前未启用。</p>
          <button
            type="button"
            onClick={() => navigate("/company-select")}
            className={styles.primaryBtn}
            style={{ marginTop: 20 }}
          >
            返回工作空间选择
          </button>
        </div>
      </div>
    );
  }

  if (!quotaQuery.isLoading && quotaQuery.data && !quotaQuery.data.canCreate) {
    return (
      <div className={styles.disabledPage}>
        <div className={styles.disabledCard}>
          <p className={styles.stepDesc}>
            您已达到创建上限（{quotaQuery.data.maxOwned} 家），当前已有 {quotaQuery.data.ownedCount}{" "}
            家。如需新建，请先删除或归档现有公司。
          </p>
          <button
            type="button"
            onClick={() => navigate("/company-select")}
            className={styles.primaryBtn}
            style={{ marginTop: 20 }}
          >
            返回工作空间选择
          </button>
        </div>
      </div>
    );
  }

  const navigateToMainChat = (prefillExample: boolean) => {
    navigate("/collaboration/chats", {
      replace: true,
      state: prefillExample ? { onboardingJustFounded: true } : undefined,
    });
  };

  const finishCompanyCreation = async (summary: FoundedSummary) => {
    const onboardingOn = isOnboardingEnabled();
    const userId = decodeJwtPayload(accessToken)?.sub?.trim();

    if (onboardingOn && userId) {
      await loadForCompany({ userId, companyId: summary.companyId }, "owner");
      if (!useOnboardingStore.getState().isStepDone("company_founded_modal")) {
        setFoundedSummary(summary);
        setBootstrapIndex(null);
        return;
      }
    }

    setBootstrapIndex(null);
    navigateToMainChat(false);
  };

  const handleFoundedEnter = () => {
    if (!foundedSummary) return;
    completeStep("company_founded_modal");
    setFoundedSummary(null);
    navigateToMainChat(true);
  };

  const handleFoundedSkip = () => {
    if (!foundedSummary) return;
    completeStep("company_founded_modal", { skipped: true });
    setFoundedSummary(null);
    navigateToMainChat(false);
  };

  const resolveDraftCompanyId = async (existingDraftId: string | null): Promise<string> => {
    if (!existingDraftId) {
      const draft = await createCompanyDraft();
      wizard.setDraftCompanyId(draft.id);
      return draft.id;
    }

    try {
      const existing = await fetchCompanyById(existingDraftId);
      if (existing.status === "active") {
        const draft = await createCompanyDraft();
        wizard.setDraftCompanyId(draft.id);
        return draft.id;
      }
      return existingDraftId;
    } catch {
      const draft = await createCompanyDraft();
      wizard.setDraftCompanyId(draft.id);
      return draft.id;
    }
  };

  const runPostCompanyBootstrap = async (company: { id: string; name: string }) => {
    setActiveCompany({ id: company.id, name: company.name });
    clearWizardPersistedState();
    setBootstrapIndex(2);
    await pollListRoomsUntilMain({ intervalMs: 2000, maxAttempts: 15 });

    const deptCount =
      wizard.organizationDraft.stats?.deptCount ?? wizard.organizationDraft.departmentPlacements.length;
    const agentCount = wizard.organizationDraft.stats?.agentCount ?? 0;

    await finishCompanyCreation({
      companyId: company.id,
      companyName: company.name,
      deptCount,
      agentCount,
    });
  };

  const handleBasicSubmit = async (values: NonNullable<typeof wizard.basicInfo>) => {
    setDraftLoading(true);
    wizard.setError(null);
    try {
      await resolveDraftCompanyId(wizard.draftCompanyId);
      wizard.setBasicInfo(values);
      wizard.goToStep(2);
    } catch (e) {
      wizard.setError(extractApiError(e, "创建草稿失败"));
    } finally {
      setDraftLoading(false);
    }
  };

  const handleConfirmCreate = async () => {
    if (!wizard.basicInfo || !wizard.draftCompanyId || !wizard.organizationDraft.departmentPlacements.length) {
      wizard.setError("请完成组织配置后再创建");
      return;
    }
    setCreating(true);
    wizard.setError(null);
    setBootstrapIndex(0);
    try {
      setBootstrapIndex(1);
      const company = await completeCompanyWizard(wizard.draftCompanyId, {
        ...wizard.basicInfo,
        departmentPlacements: wizard.organizationDraft.departmentPlacements,
      });
      await runPostCompanyBootstrap(company);
    } catch (e) {
      const message = extractApiError(e, "创建公司失败");
      if (message.includes("已创建或状态不是草稿")) {
        try {
          const existing = await fetchCompanyById(wizard.draftCompanyId);
          if (existing.status === "active") {
            await runPostCompanyBootstrap(existing);
            return;
          }
        } catch {
          // fall through to generic error
        }
      }
      wizard.setError(message);
      setBootstrapIndex(null);
    } finally {
      setCreating(false);
    }
  };

  return (
    <WizardShell step={wizard.step}>
      <WizardStepper current={wizard.step} />
      {wizard.error ? <WizardErrorBanner message={wizard.error} /> : null}

      {wizard.step === 1 ? (
        <BasicInfoStep
          initial={wizard.basicInfo}
          loading={draftLoading}
          onSubmit={(values) => void handleBasicSubmit(values)}
        />
      ) : null}

      {wizard.step === 2 && wizard.basicInfo && wizard.draftCompanyId ? (
        <TemplateRecommendStep
          basicInfo={wizard.basicInfo}
          draftCompanyId={wizard.draftCompanyId}
          initialDraft={wizard.organizationDraft}
          onBack={() => wizard.goToStep(1)}
          onContinue={(draft) => {
            wizard.setOrganizationDraft(draft);
            wizard.goToStep(3);
          }}
        />
      ) : null}

      {wizard.step === 3 && wizard.basicInfo ? (
        <ConfirmStep
          basicInfo={wizard.basicInfo}
          organizationDraft={wizard.organizationDraft}
          draftCompanyId={wizard.draftCompanyId ?? undefined}
          loading={creating}
          onBack={() => wizard.goToStep(2)}
          onConfirm={() => void handleConfirmCreate()}
          onDraftChange={(draft) => wizard.setOrganizationDraft(draft)}
        />
      ) : null}

      {bootstrapIndex != null ? <BootstrapOverlay activeIndex={bootstrapIndex} /> : null}

      {foundedSummary ? (
        <CompanyFoundedModal
          open
          companyName={foundedSummary.companyName}
          deptCount={foundedSummary.deptCount}
          agentCount={foundedSummary.agentCount}
          onEnter={handleFoundedEnter}
          onSkip={handleFoundedSkip}
        />
      ) : null}
    </WizardShell>
  );
}
