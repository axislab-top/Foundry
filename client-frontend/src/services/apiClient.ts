import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { authSession, toAuthState } from './authSession';
import { companySession } from './companySession';
import { unwrapResponse } from './apiTypes';
import type { AuthResult } from './authApi';

export const apiClient = axios.create({
  baseURL: '/api',
});

const TENANT_HEADER = 'x-company-id';

/** No interceptors — used for refresh to avoid loops */
const bareClient = axios.create({
  baseURL: '/api',
});

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

function redirectToLogin(): void {
  try {
    localStorage.removeItem('client_auth_state');
  } catch {
    /* ignore */
  }
  authSession.clear();
  companySession.setCompanyId(null);
  const returnPath = `${window.location.pathname}${window.location.search}`;
  const qs = returnPath && returnPath !== '/login' ? `?returnUrl=${encodeURIComponent(returnPath)}` : '';
  window.location.replace(`/login${qs}`);
}

let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const rt = authSession.getRefreshToken();
  if (!rt) {
    throw new Error('No refresh token');
  }
  const { data } = await bareClient.post<unknown>('/auth/refresh', { refreshToken: rt });
  const result = unwrapResponse<AuthResult>(data);
  authSession.setState(toAuthState(result));
  return result.accessToken;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authSession.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const cid = companySession.getCompanyId();
  if (cid) {
    config.headers[TENANT_HEADER] = cid;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorPayload>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

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
    if (url.includes('/auth/logout')) {
      try {
        localStorage.removeItem('client_auth_state');
      } catch {
        /* ignore */
      }
      authSession.clear();
      companySession.setCompanyId(null);
      if (error.response) {
        const { data, status: st } = error.response;
        const message = data?.message || data?.error || error.message;
        throw new ApiError(typeof message === 'string' ? message : 'Logout failed', st, data);
      }
      throw new ApiError('Logout failed');
    }
    if (url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')) {
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
      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch {
      redirectToLogin();
      throw new ApiError('Session expired', 401);
    }
  },
);
