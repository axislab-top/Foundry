import { apiClient } from "@/shared/api/client";
import { unwrapGatewayResponse } from "@/shared/api/unwrapGatewayResponse";
import type { LoginRequest, RegisterRequest, LogoutRequest } from "@/features/auth/api/types";

export type { LoginRequest, RegisterRequest, LogoutRequest } from "@/features/auth/api/types";

export async function login(req: LoginRequest) {
  return apiClient.post("/api/auth/login", req);
}

export async function register(req: RegisterRequest) {
  return apiClient.post("/api/auth/register", req);
}

export async function sendRegistrationVerificationCode(email: string) {
  return apiClient.post("/api/auth/register/send-verification-code", { email });
}

export async function logout(req?: LogoutRequest) {
  return apiClient.post("/api/auth/logout", req ?? {});
}

export async function forgotPassword(email: string) {
  return apiClient.post("/api/auth/forgot-password", { email });
}

export async function sendResetPasswordCode(email: string) {
  return apiClient.post("/api/auth/forgot-password/send-code", { email });
}

export async function resetPasswordWithCode(email: string, code: string, newPassword: string) {
  return apiClient.post("/api/auth/reset-password-with-code", { email, code, newPassword });
}

export async function resetPassword(token: string, password: string) {
  return apiClient.post("/api/auth/reset-password", { token, password });
}

export async function getWechatAuthorizeUrl(state?: string) {
  const res = await apiClient.get("/api/auth/wechat/authorize", {
    params: state ? { state } : undefined,
  });
  const payload = res.data?.data ?? res.data;
  if (payload && typeof payload === "object" && "url" in payload) {
    return payload as { url: string };
  }
  return unwrapGatewayResponse<{ url: string }>(res.data);
}

export function redirectToWechatLogin(state?: string) {
  void getWechatAuthorizeUrl(state).then(({ url }) => {
    window.location.assign(url);
  });
}
