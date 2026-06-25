import { runCoordinatedRefresh } from "@/shared/auth/crossTabRefreshCoordinator";
import { decodeJwtExpMs } from "@/shared/auth/accessTokenExpiry";
import {
  hasClientSession,
  isAccessTokenExpired,
  readClientSessionSnapshot,
} from "@/shared/auth/clientSession";
import { env, isDemoRecordingEnabled, isMockApiEnabled } from "@/shared/config/env";
import { unwrapGatewayResponse } from "@/shared/api/unwrapGatewayResponse";
import { useAuthStore } from "@/shared/store/authStore";

type RefreshResponse = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

export type RefreshAccessOutcome = {
  accessToken: string | null;
  /** Refresh endpoint rejected the session (401); client was logged out. */
  clearedSession: boolean;
};

let refreshPromise: Promise<RefreshAccessOutcome> | null = null;

let backoffUntilMs = 0;
let consecutiveTransientFailures = 0;

/** 登出时调用：取消进行中的 refresh 并停止退避重试 */
export function resetRefreshSessionState(): void {
  refreshPromise = null;
  resetTransientBackoff();
}

const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 120_000;

/** Default: refresh ~90s before access token expiry (HTTP + WS). */
const DEFAULT_REFRESH_LEAD_MS = 90_000;

function resetTransientBackoff(): void {
  backoffUntilMs = 0;
  consecutiveTransientFailures = 0;
}

function scheduleTransientBackoff(customMs?: number): void {
  consecutiveTransientFailures += 1;
  const exponential = Math.min(
    MAX_BACKOFF_MS,
    BASE_BACKOFF_MS * Math.pow(2, consecutiveTransientFailures - 1),
  );
  const jitter = Math.floor(Math.random() * 400);
  const candidate =
    customMs != null ? Math.max(customMs, exponential) + jitter : exponential + jitter;
  const waitMs = Math.min(MAX_BACKOFF_MS, Math.max(BASE_BACKOFF_MS, candidate));
  backoffUntilMs = Math.max(backoffUntilMs, Date.now() + waitMs);
}

function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
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

/** When scheduling proactive refresh, wait at least until backoff ends. */
export function getRefreshBackoffUntilMs(): number {
  return backoffUntilMs;
}

/**
 * If the access token is missing or expires within `thresholdMs`, refresh once (deduped).
 * Soft refresh respects transient backoff; does not clear the session on failure.
 */
export async function ensureAccessTokenFresh(thresholdMs = DEFAULT_REFRESH_LEAD_MS): Promise<void> {
  const { refreshToken, accessTokenExpiresAt, accessToken } = useAuthStore.getState();
  if (!refreshToken?.trim()) return;
  const expMs = accessTokenExpiresAt ?? decodeJwtExpMs(accessToken);
  if (!expMs) return;
  if (Date.now() < expMs - thresholdMs) return;
  await getRefreshedAccessTokenResult(false);
}

/**
 * @param force - When true (e.g. HTTP 401 recovery), bypass transient backoff so the user is not logged out only because of a recent network blip.
 */
export function getRefreshedAccessTokenResult(force = false): Promise<RefreshAccessOutcome> {
  if (!force && Date.now() < backoffUntilMs) {
    return Promise.resolve({ accessToken: null, clearedSession: false });
  }

  const { refreshToken: sessionRefreshToken } = useAuthStore.getState();
  if (!sessionRefreshToken?.trim()) {
    return Promise.resolve({ accessToken: null, clearedSession: false });
  }

  if (!refreshPromise) {
    refreshPromise = runCoordinatedRefresh("client", performRefresh).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function getRefreshedAccessToken(force = false): Promise<string | null> {
  const r = await getRefreshedAccessTokenResult(force);
  return r.accessToken;
}

/**
 * 访客页（/login）跳转应用前：确认 refresh 仍被 Gateway 接受，而非仅 localStorage 有残留。
 */
export async function verifyPersistedSessionAlive(): Promise<boolean> {
  if (isMockApiEnabled() || isDemoRecordingEnabled()) {
    return hasClientSession();
  }

  const snapshot = readClientSessionSnapshot();
  if (!hasClientSession(snapshot)) {
    return false;
  }

  if (!isAccessTokenExpired(snapshot)) {
    return true;
  }

  const outcome = await getRefreshedAccessTokenResult(true);
  return Boolean(outcome.accessToken);
}

const MOCK_ACCESS_TOKEN = "mock-jwt-token-for-dev";
const MOCK_REFRESH_TOKEN = "mock-refresh-token-for-dev";

async function performRefresh(ctx: {
  role: "leader" | "follower";
}): Promise<RefreshAccessOutcome> {
  if (isDemoRecordingEnabled() || isMockApiEnabled()) {
    return {
      accessToken: MOCK_ACCESS_TOKEN,
      clearedSession: false,
    };
  }

  if (ctx.role === "follower") {
    await useAuthStore.persist.rehydrate();
    const access = useAuthStore.getState().accessToken?.trim();
    return {
      accessToken: access && access.length > 0 ? access : null,
      clearedSession: false,
    };
  }

  const { refreshToken, setTokens } = useAuthStore.getState();
  if (!refreshToken?.trim()) {
    return { accessToken: null, clearedSession: false };
  }

  const refreshTokenSnapshot = refreshToken;

  const stillCurrent = useAuthStore.getState().refreshToken?.trim();
  if (!stillCurrent || stillCurrent !== refreshTokenSnapshot) {
    return { accessToken: null, clearedSession: false };
  }

  try {
    const res = await fetch(`${env.apiBaseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenSnapshot }),
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
            return { accessToken: null, clearedSession: false };
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
        return { accessToken: null, clearedSession: false };
      }
      applyTransientBackoffForRefreshFailure(res);
      return { accessToken: null, clearedSession: false };
    }

    const data = unwrapGatewayResponse<RefreshResponse>(parsed);
    const access =
      typeof data?.accessToken === "string" && data.accessToken.length > 0 ? data.accessToken : null;
    if (!access) {
      scheduleTransientBackoff();
      return { accessToken: null, clearedSession: false };
    }

    const nextRefresh =
      typeof data.refreshToken === "string" && data.refreshToken.trim().length > 0
        ? data.refreshToken
        : refreshTokenSnapshot;

    resetTransientBackoff();
    setTokens({
      accessToken: access,
      refreshToken: nextRefresh,
      expiresIn: typeof data.expiresIn === "number" ? data.expiresIn : undefined,
    });

    return { accessToken: access, clearedSession: false };
  } catch {
    scheduleTransientBackoff();
    return { accessToken: null, clearedSession: false };
  }
}
