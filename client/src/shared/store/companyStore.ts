import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isDemoRecordingEnabled, isMockApiEnabled } from "@/shared/config/env";

const MOCK_COMPANY_ID = "a0a0a0a0-b1b1-4122-8122-a11111111111";
const DEMO_COMPANY_NAME = "星火内容工作室";

function demoCompanySeed(): Pick<CompanyStore, "activeCompany" | "hydrated"> {
  if (!isDemoRecordingEnabled() && !isMockApiEnabled()) {
    return { activeCompany: null, hydrated: false };
  }
  return {
    activeCompany: { id: MOCK_COMPANY_ID, name: DEMO_COMPANY_NAME },
    hydrated: true,
  };
}

type Company = {
  id: string;
  name: string;
};

type CompanyStore = {
  activeCompany: Company | null;
  hydrated: boolean;
  setActiveCompany: (company: Company) => void;
  clearActiveCompany: () => void;
  setHydrated: (value: boolean) => void;
};

const LS_KEY = "foundry.company.v1";

export const useCompanyStore = create<CompanyStore>()(
  persist(
    (set) => ({
      ...demoCompanySeed(),
      setActiveCompany: (company) => set({ activeCompany: company }),
      clearActiveCompany: () => set({ activeCompany: null }),
      setHydrated: (value) => set({ hydrated: value }),
    }),
    {
      name: LS_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeCompany: state.activeCompany,
      }),
      merge: (persisted, current) => {
        if (isDemoRecordingEnabled() || isMockApiEnabled()) {
          return { ...current, ...demoCompanySeed(), hydrated: true };
        }
        return { ...current, ...(persisted as Partial<CompanyStore>) };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn("[companyStore] rehydrate failed", error);
        }
        if (!state) {
          useCompanyStore.getState().setHydrated(true);
          return;
        }
        if (isDemoRecordingEnabled() || isMockApiEnabled()) {
          state.setActiveCompany({ id: MOCK_COMPANY_ID, name: DEMO_COMPANY_NAME });
          state.setHydrated(true);
          return;
        }
        if (state.activeCompany?.id === MOCK_COMPANY_ID) {
          state.clearActiveCompany();
        }
        state.setHydrated(true);
      },
    },
  ),
);
