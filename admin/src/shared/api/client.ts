import { computeAccessTokenExpiresAt } from '../auth/accessTokenExpiry';
import { setAccessTokenExpiresAt } from '../auth/sessionStorage';
import { getRefreshedAccessToken } from './refreshSession';
import {
  clearAdminTokens,
  getAccessToken,
  getRefreshToken,
  saveAdminTokenPair
} from './tokens';
import { API_BASE_URL } from './apiBaseUrl';

export { clearAdminTokens, getAccessToken, getRefreshToken, notifyAdminSessionExpired } from './tokens';
export { ADMIN_SESSION_EXPIRED_EVENT } from './tokens';

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type AuthUser = {
  id: string;
  username: string;
  email: string;
};

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
};

function isAuthResponse(value: unknown): value is AuthResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AuthResponse>;
  const user = candidate.user as Partial<AuthUser> | undefined;

  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    !!user &&
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    typeof user.email === 'string' &&
    user.email.length > 0 &&
    typeof user.username === 'string' &&
    user.username.length > 0
  );
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });
  return parseJsonResponse<T>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const rawBody = await response.text();
  let payload: ApiResult<T> | T | null = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as ApiResult<T> | T;
    } catch {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${rawBody.slice(0, 180)}`);
      }
      throw new Error(`Invalid JSON response: ${rawBody.slice(0, 180)}`);
    }
  }

  if (!response.ok) {
    const message =
      (payload as ApiResult<T> | null)?.error?.message ??
      `Request failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && 'success' in (payload as ApiResult<T>)) {
    return ((payload as ApiResult<T>).data ?? {}) as T;
  }

  return (payload ?? ({} as T)) as T;
}

export function saveAdminTokens(auth: AuthResponse): void {
  saveAdminTokenPair(auth.accessToken, auth.refreshToken);
  const expiresAt = computeAccessTokenExpiresAt(auth.accessToken, auth.expiresIn);
  setAccessTokenExpiresAt(expiresAt);
}

export function saveAdminTokensFromRefresh(payload: {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}): void {
  saveAdminTokenPair(payload.accessToken, payload.refreshToken);
  const expiresAt = computeAccessTokenExpiresAt(payload.accessToken, payload.expiresIn);
  setAccessTokenExpiresAt(expiresAt);
}

export async function adminAuthedRequestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const withToken = (token: string | null): RequestInit => ({
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });

  const requestOnce = async (token: string | null): Promise<Response> => {
    return fetch(`${API_BASE_URL}${path}`, withToken(token));
  };

  const currentToken = getAccessToken();
  let response = await requestOnce(currentToken);
  if (response.status !== 401) {
    return parseJsonResponse<T>(response);
  }

  const nextToken = await getRefreshedAccessToken(true);
  if (!nextToken) {
    throw new Error('登录已过期，请重新登录。');
  }

  response = await requestOnce(nextToken);
  return parseJsonResponse<T>(response);
}

export async function adminLogin(payload: { email: string; password: string }): Promise<AuthResponse> {
  const response = await request<AuthResponse>('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!isAuthResponse(response)) {
    throw new Error('登录响应不完整，请检查认证服务状态。');
  }
  return response;
}

export async function adminRegister(payload: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const response = await request<AuthResponse>('/api/auth/admin/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!isAuthResponse(response)) {
    throw new Error('注册响应不完整，请检查认证服务状态。');
  }
  return response;
}
