import { subscribeToAuthStorageSync } from '@foundry/web-auth-session';

const ACCESS_TOKEN_KEY = 'foundry-admin-access-token';
const REFRESH_TOKEN_KEY = 'foundry-admin-refresh-token';

export const ADMIN_REFRESH_TOKEN_STORAGE_KEY = REFRESH_TOKEN_KEY;

export const ADMIN_SESSION_EXPIRED_EVENT = 'foundry-admin-session-expired';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearAdminTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function saveAdminTokenPair(accessToken: string, refreshToken: string): void {
  setAccessToken(accessToken);
  setRefreshToken(refreshToken);
}

export function notifyAdminSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
  }
}

/** Sync tokens when another admin tab completes refresh. */
export function installAdminCrossTabTokenSync(onTokensChanged: () => void): () => void {
  const unsubRefresh = subscribeToAuthStorageSync(REFRESH_TOKEN_KEY, onTokensChanged);
  const unsubAccess = subscribeToAuthStorageSync(ACCESS_TOKEN_KEY, onTokensChanged);
  return () => {
    unsubRefresh();
    unsubAccess();
  };
}
