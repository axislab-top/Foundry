import { subscribeToAuthStorageSync } from "@/shared/auth/crossTabRefreshCoordinator";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { computeAccessTokenExpiresAt } from "@/shared/auth/accessTokenExpiry";
import { isDemoRecordingEnabled } from "@/shared/config/env";

const MOCK_ACCESS_TOKEN = "mock-jwt-token-for-dev";

function demoAuthSeed(): Pick<
  AuthState,
  "accessToken" | "refreshToken" | "expiresIn" | "accessTokenExpiresAt" | "hydrated"
> {
  if (!isDemoRecordingEnabled()) {
    return {
      accessToken: undefined,
      refreshToken: undefined,
      expiresIn: undefined,
      accessTokenExpiresAt: undefined,
      hydrated: false,
    };
  }
  return {
    accessToken: MOCK_ACCESS_TOKEN,
    refreshToken: "mock-refresh-token-for-dev",
    expiresIn: 99999,
    accessTokenExpiresAt: computeAccessTokenExpiresAt(MOCK_ACCESS_TOKEN, 99999),
    hydrated: true,
  };
}

type AuthState = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  /** Epoch ms — when the current access token should be treated as expired */
  accessTokenExpiresAt?: number;
  hydrated: boolean;
  setTokens: (t: { accessToken: string; refreshToken: string; expiresIn?: number }) => void;
  clear: () => void;
  setHydrated: (value: boolean) => void;
};

const LS_KEY = "foundry.auth.v1";

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...demoAuthSeed(),
      setHydrated: (value) => set(() => ({ hydrated: value })),
      setTokens: (t) =>
        set(() => {
          const accessTokenExpiresAt = computeAccessTokenExpiresAt(t.accessToken, t.expiresIn);
          return {
            accessToken: t.accessToken,
            refreshToken: t.refreshToken,
            expiresIn: t.expiresIn,
            accessTokenExpiresAt,
          };
        }),
      clear: () =>
        set(() => ({
          accessToken: undefined,
          refreshToken: undefined,
          expiresIn: undefined,
          accessTokenExpiresAt: undefined,
        })),
    }),
    {
      name: LS_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        expiresIn: state.expiresIn,
        accessTokenExpiresAt: state.accessTokenExpiresAt,
      }),
      merge: (persisted, current) => {
        if (isDemoRecordingEnabled()) {
          return { ...current, ...demoAuthSeed(), hydrated: true };
        }
        return { ...current, ...(persisted as Partial<AuthState>) };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn("[authStore] rehydrate failed", error);
        }
        if (!state) {
          useAuthStore.getState().setHydrated(true);
          return;
        }
        if (isDemoRecordingEnabled()) {
          state.setTokens({
            accessToken: MOCK_ACCESS_TOKEN,
            refreshToken: "mock-refresh-token-for-dev",
            expiresIn: 99999,
          });
          state.setHydrated(true);
          return;
        }
        if (state.accessToken === MOCK_ACCESS_TOKEN) {
          state.clear();
        }
        if (!state.refreshToken?.trim() && state.accessToken?.trim()) {
          state.clear();
        }
        state.setHydrated(true);
      },
    },
  ),
);

if (typeof window !== "undefined") {
  subscribeToAuthStorageSync(LS_KEY, () => {
    void useAuthStore.persist.rehydrate();
  });
}
