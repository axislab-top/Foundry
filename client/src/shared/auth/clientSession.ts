/**
 * 客户端会话模型（SPA 最佳实践）
 *
 * - **已登录** = 存在有效的 refresh token（长期会话凭据），而非仅有 access token。
 * - access token 单独残留（登出不完整）视为未登录，避免 /login ↔ /company-select 循环。
 * - 有 refresh、access 过期时仍算已登录（由 refreshSession 续期）。
 * - 有 refresh、无公司 → /company-select；有 refresh + 公司 → 应用内首页。
 */

import { decodeJwtExpMs } from "@/shared/auth/accessTokenExpiry";
import { isDemoRecordingEnabled, isMockApiEnabled } from "@/shared/config/env";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";

export const AUTH_STORAGE_KEY = "foundry.auth.v1";
export const COMPANY_STORAGE_KEY = "foundry.company.v1";

const MOCK_ACCESS_TOKEN = "mock-jwt-token-for-dev";
const MOCK_REFRESH_TOKEN = "mock-refresh-token-for-dev";

export type ClientSessionSnapshot = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
};

export function readClientSessionSnapshot(): ClientSessionSnapshot {
  const { accessToken, refreshToken, accessTokenExpiresAt } = useAuthStore.getState();
  return { accessToken, refreshToken, accessTokenExpiresAt };
}

function isMockSessionAllowed(): boolean {
  return isDemoRecordingEnabled() || isMockApiEnabled();
}

export function isMockClientSession(snapshot: ClientSessionSnapshot): boolean {
  const access = snapshot.accessToken?.trim();
  const refresh = snapshot.refreshToken?.trim();
  return access === MOCK_ACCESS_TOKEN || refresh === MOCK_REFRESH_TOKEN;
}

/**
 * 是否存在可继续使用的本地会话（以 refresh token 为准）。
 */
export function hasClientSession(snapshot: ClientSessionSnapshot = readClientSessionSnapshot()): boolean {
  const refresh = snapshot.refreshToken?.trim();
  if (!refresh) return false;

  if (isMockSessionAllowed() && isMockClientSession(snapshot)) {
    return true;
  }

  const access = snapshot.accessToken?.trim();
  if (access === MOCK_ACCESS_TOKEN || refresh === MOCK_REFRESH_TOKEN) {
    return false;
  }

  return true;
}

/** 访客路由（/login 等）是否应重定向到应用内 */
export function shouldRedirectAuthenticatedGuest(
  snapshot: ClientSessionSnapshot = readClientSessionSnapshot(),
): boolean {
  return hasClientSession(snapshot);
}

export function isAccessTokenExpired(snapshot: ClientSessionSnapshot = readClientSessionSnapshot()): boolean {
  const access = snapshot.accessToken?.trim();
  if (!access) return true;
  const expMs = snapshot.accessTokenExpiresAt ?? decodeJwtExpMs(access);
  if (!expMs) return false;
  return Date.now() >= expMs;
}

/**
 * 清除残缺会话：仅有 access、无 refresh（常见于登出后 localStorage 未清干净）。
 */
export function reconcileStaleClientSession(): void {
  if (isDemoRecordingEnabled()) return;

  const snapshot = readClientSessionSnapshot();
  if (hasClientSession(snapshot)) return;

  const hasOrphanAccess = Boolean(snapshot.accessToken?.trim());
  if (!hasOrphanAccess) return;

  useAuthStore.getState().clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/** 同步抹掉持久化会话（登出 / refresh 401 时必须 await 或同步 removeItem 后再跳转） */
export function purgePersistedClientSession(): void {
  useAuthStore.getState().clear();
  useCompanyStore.getState().clearActiveCompany();

  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(COMPANY_STORAGE_KEY);
  } catch {
    // ignore
  }

  void useAuthStore.persist.clearStorage();
  void useCompanyStore.persist.clearStorage();
}
