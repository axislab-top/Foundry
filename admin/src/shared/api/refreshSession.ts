import { runCoordinatedRefresh } from '@foundry/web-auth-session';
import { computeAccessTokenExpiresAt } from '../auth/accessTokenExpiry';
import {
  clearAccessTokenExpiresAt,
  clearSessionUser,
  getAccessTokenExpiresAt,
  setAccessTokenExpiresAt
} from '../auth/sessionStorage';
import {
  clearAdminTokens,
  getAccessToken,
  getRefreshToken,
  notifyAdminSessionExpired,
  saveAdminTokenPair
} from './tokens';
import { API_BASE_URL } from './apiBaseUrl';

type RefreshResponse = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

export type RefreshAccessOutcome = {
  accessToken: string | null;
  clearedSession: boolean;
};

let refreshPromise: Promise<RefreshAccessOutcome> | null = null;

let backoffUntilMs = 0;
let consecutiveTransientFailures = 0;

const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 120_000;
const DEFAULT_REFRESH_LEAD_MS = 90_000;

function resetTransientBackoff(): void {
  backoffUntilMs = 0;
  consecutiveTransientFailures = 0;
}

function scheduleTransientBackoff(customMs?: number): void {
  consecutiveTransientFailures += 1;
  const exponential = Math.min(
    MAX_BACKOFF_MS,
    BASE_BACKOFF_MS * Math.pow(2, consecutiveTransientFailures - 1)
  );
  const jitter = Math.floor(Math.random() * 400);
  const candidate =
    customMs != null ? Math.max(customMs, exponential) + jitter : exponential + jitter;
  const waitMs = Math.min(MAX_BACKOFF_MS, Math.max(BASE_BACKOFF_MS, candidate));
  backoffUntilMs = Math.max(backoffUntilMs, Date.now() + waitMs);
}

function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get('retry-after');
  if (!raw?.trim()) return undefined;
  const asSec = Number.parseInt(raw, 10);
  if (Number.isFinite(asSec) && asSec > 0) {
    return asSec * 1000;
  }
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return undefined;
}

function applyTransientBackoffForRefreshFailure(res: Response): void {
  const retryAfter = parseRetryAfterMs(res);
  if (res.status === 429) {
    scheduleTransientBackoff(retryAfter ?? undefined);
    return;
  }
  if (res.status === 408 || (res.status >= 500 && res.status <= 599)) {
    scheduleTransientBackoff(retryAfter ?? undefined);
    return;
  }
  scheduleTransientBackoff(retryAfter ?? undefined);
}

export function getRefreshBackoffUntilMs(): number {
  return backoffUntilMs;
}

function unwrapGatewayResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    (payload as ApiResult<T>).success === true &&
    'data' in payload
  ) {
    return (payload as ApiResult<T>).data as T;
  }
  return payload as T;
}

function clearAdminSession(): void {
  clearAdminTokens();
  clearSessionUser();
  clearAccessTokenExpiresAt();
  notifyAdminSessionExpired();
}

export async function ensureAccessTokenFresh(thresholdMs = DEFAULT_REFRESH_LEAD_MS): Promise<void> {
  if (!getRefreshToken()) return;
  const expMs = getAccessTokenExpiresAt();
  if (!expMs) return;
  if (Date.now() < expMs - thresholdMs) return;
  await getRefreshedAccessTokenResult(false);
}

export function getRefreshedAccessTokenResult(force = false): Promise<RefreshAccessOutcome> {
  if (!force && Date.now() < backoffUntilMs) {
    return Promise.resolve({ accessToken: null, clearedSession: false });
  }

  if (!refreshPromise) {
    refreshPromise = runCoordinatedRefresh('admin', performRefresh).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function getRefreshedAccessToken(force = false): Promise<string | null> {
  const result = await getRefreshedAccessTokenResult(force);
  return result.accessToken;
}

async function performRefresh(ctx: {
  role: 'leader' | 'follower';
}): Promise<RefreshAccessOutcome> {
  if (ctx.role === 'follower') {
    const access = getAccessToken()?.trim();
    return {
      accessToken: access && access.length > 0 ? access : null,
      clearedSession: false
    };
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return { accessToken: null, clearedSession: false };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(15_000)
    });

    const rawText = await res.text();
    let parsed: unknown = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        if (!res.ok) {
          if (res.status === 401) {
            resetTransientBackoff();
            clearAdminSession();
            return { accessToken: null, clearedSession: true };
          }
          applyTransientBackoffForRefreshFailure(res);
          return { accessToken: null, clearedSession: false };
        }
        scheduleTransientBackoff();
        return { accessToken: null, clearedSession: false };
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        resetTransientBackoff();
        clearAdminSession();
        return { accessToken: null, clearedSession: true };
      }
      applyTransientBackoffForRefreshFailure(res);
      return { accessToken: null, clearedSession: false };
    }

    const data = unwrapGatewayResponse<RefreshResponse>(parsed);
    const access =
      typeof data?.accessToken === 'string' && data.accessToken.length > 0 ? data.accessToken : null;
    if (!access) {
      scheduleTransientBackoff();
      return { accessToken: null, clearedSession: false };
    }

    const nextRefresh =
      typeof data.refreshToken === 'string' && data.refreshToken.trim().length > 0
        ? data.refreshToken
        : refreshToken;

    resetTransientBackoff();
    saveAdminTokenPair(access, nextRefresh);
    setAccessTokenExpiresAt(
      computeAccessTokenExpiresAt(access, typeof data.expiresIn === 'number' ? data.expiresIn : undefined)
    );

    return { accessToken: access, clearedSession: false };
  } catch {
    scheduleTransientBackoff();
    return { accessToken: null, clearedSession: false };
  }
}
