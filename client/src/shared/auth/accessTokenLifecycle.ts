import { decodeJwtExpMs } from "@/shared/auth/accessTokenExpiry";
import {
  ensureAccessTokenFresh,
  getRefreshedAccessToken,
  getRefreshBackoffUntilMs,
} from "@/shared/api/refreshSession";
import { useAuthStore } from "@/shared/store/authStore";

const VISIBILITY_LEAD_MS = 90_000;
const TIMER_MIN_DELAY_MS = 5_000;

/**
 * Keeps access tokens fresh while the app is open: timer before expiry (covers WS-heavy tabs),
 * plus visibility/focus hooks to recover after sleep.
 */
export function startAccessTokenRefreshScheduler(): () => void {
  if (typeof window === "undefined") return () => {};

  let timeoutId: number | null = null;

  const clearTimer = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const scheduleNext = () => {
    clearTimer();
    const { refreshToken, accessTokenExpiresAt, accessToken } = useAuthStore.getState();
    if (!refreshToken?.trim()) return;
    const expMs = accessTokenExpiresAt ?? decodeJwtExpMs(accessToken);
    if (!expMs) return;
    const raw = expMs - VISIBILITY_LEAD_MS - Date.now();
    const backoffWait = Math.max(0, getRefreshBackoffUntilMs() - Date.now());
    const delay = Math.max(TIMER_MIN_DELAY_MS, raw > 0 ? raw : 60_000, backoffWait);
    if (!Number.isFinite(delay)) return;
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      void getRefreshedAccessToken(false).finally(() => {
        scheduleNext();
      });
    }, delay);
  };

  const unsubStore = useAuthStore.subscribe(() => {
    scheduleNext();
  });

  const unsubHydration = useAuthStore.persist.onFinishHydration(() => {
    void ensureAccessTokenFresh();
    scheduleNext();
  });

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void ensureAccessTokenFresh().finally(() => scheduleNext());
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);

  void ensureAccessTokenFresh().finally(() => scheduleNext());

  return () => {
    clearTimer();
    unsubStore();
    unsubHydration();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}
