import { create } from 'zustand';
import type { CompanyIndustryCode } from '@contracts/types';
import type { RecommendedDepartmentPlacement } from '../services/companiesApi';

/** 与 sessionStorage 同步，供刷新后恢复草稿公司 ID */
export const WIZARD_DRAFT_SESSION_KEY = 'nc_wizard_draft_company_id';

export type OrgTemplateId = 'growth' | 'stable' | 'innovation';

export interface CeoDraft {
  personalityTags: string[];
  decisionStyle: 'democratic' | 'autocratic' | 'consensus';
  reportFrequency: 'daily' | 'hourly' | 'realtime';
}

export interface NewCompanyDraft {
  name: string;
  industryCode: CompanyIndustryCode;
  description: string;
  goal: string;
  scale: 'small' | 'medium' | 'large';
  initialBudget: number;
  budgetCurrency: 'CNY' | 'USD';
  timezone: string;
  logoUrl: string | null;
  orgTemplate: OrgTemplateId;
  ceo: CeoDraft;
}

const defaultCeo = (): CeoDraft => ({
  personalityTags: ['创新型', '数据驱动型'],
  decisionStyle: 'consensus',
  reportFrequency: 'daily',
});

const defaultDraft = (): NewCompanyDraft => ({
  name: '',
  industryCode: 'other',
  description: '',
  goal: '',
  scale: 'small',
  initialBudget: 5000,
  budgetCurrency: 'CNY',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
  logoUrl: null,
  orgTemplate: 'stable',
  ceo: defaultCeo(),
});

interface NewCompanyState {
  entryMode: 'idle' | 'wizard' | 'quick';
  step: number;
  /** 向导用草稿公司 ID（服务端 status=draft；用于 x-company-id 与转正） */
  draftCompanyId: string | null;
  draft: NewCompanyDraft;
  quickNl: string;
  quickPreviewJson: string | null;
  /** 步骤 1/2 冻结的组织+商城 Agent 快照，随 complete 提交；未设置则服务端用行业默认 */
  wizardDepartmentPlacements: RecommendedDepartmentPlacement[] | null;
  reset: () => void;
  setEntryMode: (m: NewCompanyState['entryMode']) => void;
  setStep: (n: number) => void;
  setDraftCompanyId: (id: string | null) => void;
  patchDraft: (p: Partial<NewCompanyDraft>) => void;
  patchCeo: (p: Partial<CeoDraft>) => void;
  applyExample: (partial: Partial<NewCompanyDraft> & { ceo?: Partial<CeoDraft> }) => void;
  setQuickNl: (s: string) => void;
  setQuickPreviewJson: (s: string | null) => void;
  setWizardDepartmentPlacements: (p: RecommendedDepartmentPlacement[] | null) => void;
}

export const useNewCompanyStore = create<NewCompanyState>((set) => ({
  entryMode: 'idle',
  step: 0,
  draftCompanyId: null,
  draft: defaultDraft(),
  quickNl: '',
  quickPreviewJson: null,
  wizardDepartmentPlacements: null,
  reset: () => {
    try {
      sessionStorage.removeItem(WIZARD_DRAFT_SESSION_KEY);
    } catch {
      /* ignore */
    }
    set({
      entryMode: 'idle',
      step: 0,
      draftCompanyId: null,
      draft: defaultDraft(),
      quickNl: '',
      quickPreviewJson: null,
      wizardDepartmentPlacements: null,
    });
  },
  setEntryMode: (entryMode) => set({ entryMode }),
  setStep: (step) => set({ step }),
  setDraftCompanyId: (draftCompanyId) => {
    try {
      if (draftCompanyId) {
        sessionStorage.setItem(WIZARD_DRAFT_SESSION_KEY, draftCompanyId);
      } else {
        sessionStorage.removeItem(WIZARD_DRAFT_SESSION_KEY);
      }
    } catch {
      /* ignore */
    }
    set({ draftCompanyId });
  },
  patchDraft: (p) => set((s) => ({ draft: { ...s.draft, ...p } })),
  patchCeo: (p) => set((s) => ({ draft: { ...s.draft, ceo: { ...s.draft.ceo, ...p } } })),
  applyExample: (partial) =>
    set((s) => {
      const { ceo: ceoPatch, ...rest } = partial;
      return {
        draft: {
          ...s.draft,
          ...rest,
          ceo: ceoPatch ? { ...s.draft.ceo, ...ceoPatch } : s.draft.ceo,
        },
      };
    }),
  setQuickNl: (quickNl) => set({ quickNl }),
  setQuickPreviewJson: (quickPreviewJson) => set({ quickPreviewJson }),
  setWizardDepartmentPlacements: (wizardDepartmentPlacements) => set({ wizardDepartmentPlacements }),
}));
