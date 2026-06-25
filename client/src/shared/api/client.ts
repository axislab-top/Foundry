import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { env, isMockApiEnabled } from "@/shared/config/env";
import { mockAdapter } from "@/shared/api/mockAdapter";
import { ensureAccessTokenFresh, getRefreshedAccessTokenResult } from "@/shared/api/refreshSession";
import { clearClientSession } from "@/shared/auth/clearClientSession";
import { useAuthStore } from "@/shared/store/authStore";
import { useCompanyStore } from "@/shared/store/companyStore";

function isUuidLike(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type RequestWithRetry = InternalAxiosRequestConfig & { _retry?: boolean };

/** 401 在此类路径上表示凭证错误等，不应触发 refresh + 重试 */
function isAuthCredentialRoute(config: InternalAxiosRequestConfig): boolean {
  const url = config.url ?? "";
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/register/send-verification-code") ||
    url.includes("/auth/forgot-password") ||
    url.includes("/auth/reset-password") ||
    url.includes("/auth/admin/login") ||
    url.includes("/auth/admin/register") ||
    url.includes("/auth/logout") ||
    url.includes("/auth/refresh")
  );
}

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15000,
});

// [MOCK] 演示录制 / 本地无后端时使用 mockAdapter 拦截 API
if (isMockApiEnabled()) {
  apiClient.defaults.adapter = mockAdapter;
}

/** file-assets 下载/预览端点：鉴权失败时不应触发全局登出 */
function isFileAssetDownloadRequest(config: InternalAxiosRequestConfig): boolean {
  const url = config.url ?? "";
  return /\/file-assets\/[^/?]+\/download/.test(url);
}

apiClient.interceptors.request.use(async (config) => {
  if (!isAuthCredentialRoute(config)) {
    await ensureAccessTokenFresh();
  }
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  const companyId = useCompanyStore.getState().activeCompany?.id;
  if (isUuidLike(companyId)) {
    config.headers = config.headers ?? {};
    (config.headers as any)["x-company-id"] = companyId;
  }
  return config;
});
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as RequestWithRetry | undefined;

    if (status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    // [MOCK] 演示/mock 模式无真实 refresh，避免 401 触发登出死循环
    if (isMockApiEnabled()) {
      return Promise.reject(error);
    }

    if (isAuthCredentialRoute(originalRequest)) {
      return Promise.reject(error);
    }

    const isFileDownload = isFileAssetDownloadRequest(originalRequest);

    if (originalRequest._retry) {
      if (!isFileDownload) {
        clearClientSession();
      }
      return Promise.reject(error);
    }

    const outcome = await getRefreshedAccessTokenResult(true);
    if (outcome.accessToken) {
      originalRequest._retry = true;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${outcome.accessToken}`;
      return apiClient(originalRequest);
    }

    // 文件下载/预览失败不触发登出，避免用户操作文件时被踢回登录页
    if (isFileDownload) {
      return Promise.reject(error);
    }

    if (outcome.clearedSession) {
      return Promise.reject(error);
    }

    if (!useAuthStore.getState().refreshToken?.trim()) {
      clearClientSession();
      return Promise.reject(error);
    }

    clearClientSession({ sessionExpired: true });
    return Promise.reject(error);
  },
);
