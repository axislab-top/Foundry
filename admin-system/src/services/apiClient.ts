import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { authSession, toAuthState } from './authSession';
import type { AuthResult } from './authApi';

export const apiClient = axios.create({
  baseURL: '/api',
});

const AUTH_STORAGE_KEY = 'admin_auth_state';

export interface ApiErrorPayload {
  message?: string;
  error?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export class ApiError extends Error {
  public readonly status?: number;
  public readonly payload?: ApiErrorPayload;

  constructor(message: string, status?: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function unwrapResponse<T>(data: unknown): T {
  if (
    data &&
    typeof data === 'object' &&
    'success' in data &&
    (data as { success: boolean }).success === true &&
    'data' in data
  ) {
    return (data as { data: T }).data;
  }
  return data as T;
}

const bareClient = axios.create({
  baseURL: '/api',
});

function redirectToLogin(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  authSession.clear();
  window.location.replace('/login');
}

let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const rt = authSession.getRefreshToken();
  if (!rt) throw new Error('No refresh token');

  const { data } = await bareClient.post<unknown>('/auth/refresh', {
    refreshToken: rt,
  });
  const result = unwrapResponse<AuthResult>(data);
  authSession.setState(toAuthState(result));
  return result.accessToken;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authSession.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorPayload>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    // 非鉴权错误：按旧逻辑抛出
    if (!original || status !== 401) {
      if (error.response) {
        const { data, status: st } = error.response;
        const message = data?.message || data?.error || error.message;
        throw new ApiError(typeof message === 'string' ? message : 'Request failed', st, data);
      }
      if (error.request) {
        throw new ApiError('Network error, request not received');
      }
      throw new ApiError(error.message);
    }

    const url = original.url || '';

    // 登出不走刷新
    if (url.includes('/auth/logout')) {
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      authSession.clear();

      if (error.response) {
        const { data, status: st } = error.response;
        const message = data?.message || data?.error || error.message;
        throw new ApiError(typeof message === 'string' ? message : 'Logout failed', st, data);
      }
      throw new ApiError('Logout failed');
    }

    // 登录/刷新链路失败时，直接抛错
    if (
      url.includes('/auth/login') ||
      url.includes('/auth/admin/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh')
    ) {
      if (error.response) {
        const { data, status: st } = error.response;
        const message = data?.message || data?.error || error.message;
        throw new ApiError(typeof message === 'string' ? message : 'Request failed', st, data);
      }
      throw new ApiError('Unauthorized');
    }

    if (original._retry) {
      redirectToLogin();
      throw new ApiError('Session expired', 401);
    }

    original._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      const newAccess = await refreshPromise;
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch {
      redirectToLogin();
      throw new ApiError('Session expired', 401);
    }
  },
);

