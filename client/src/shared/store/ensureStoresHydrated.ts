import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";

const HYDRATION_TIMEOUT_MS = 3_000;

/** Ensure zustand persist finished before first paint; never block forever. */
export async function ensureStoresHydrated(): Promise<void> {
  const forceHydrated = () => {
    if (!useAuthStore.getState().hydrated) {
      useAuthStore.getState().setHydrated(true);
    }
    if (!useCompanyStore.getState().hydrated) {
      useCompanyStore.getState().setHydrated(true);
    }
  };

  await Promise.race([
    Promise.all([useAuthStore.persist.rehydrate(), useCompanyStore.persist.rehydrate()]),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, HYDRATION_TIMEOUT_MS);
    }),
  ]);

  forceHydrated();
}
