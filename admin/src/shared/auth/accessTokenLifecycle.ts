import { decodeJwtExpMs } from './accessTokenExpiry';
import { getAccessTokenExpiresAt } from './sessionStorage';
import {
  ensureAccessTokenFresh,
  getRefreshedAccessToken,
  getRefreshBackoffUntilMs
} from '../api/refreshSession';
import { getAccessToken, getRefreshToken } from '../api/client';

const VISIBILITY_LEAD_MS = 90_000;
const TIMER_MIN_DELAY_MS = 5_000;

export function startAccessTokenRefreshScheduler(): () => void {
  if (typeof window === 'undefined') return () => {};

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const scheduleNext = () => {
    clearTimer();
    if (!getRefreshToken()?.trim()) return;
    const expMs = getAccessTokenExpiresAt() ?? decodeJwtExpMs(getAccessToken() ?? undefined);
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

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    void ensureAccessTokenFresh().finally(() => scheduleNext());
  };

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  void ensureAccessTokenFresh().finally(() => scheduleNext());

  return () => {
    clearTimer();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}
