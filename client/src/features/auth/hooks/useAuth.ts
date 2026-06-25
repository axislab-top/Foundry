import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as authApi from "@/features/auth/api/authApi";
import { resolvePostAuthDestination } from "@/shared/auth/postAuthRedirect";
import { extractTokenPayload } from "@/shared/auth/tokenPayload";
import {
  normalizeUsername,
  validateLoginFields,
  validatePasswordPair,
  validateRegisterFields,
  isValidEmail,
} from "@/shared/auth/validation";
import { logoutUser } from "@/shared/auth/logout";
import {
  extractForgotPasswordError,
  extractLoginError,
  extractRegisterError,
  extractResetPasswordError,
  extractApiError,
} from "@/shared/api/extractApiError";
import { isRegisterEmailVerificationEnabled } from "@/shared/config/env";
import { unwrapGatewayResponse } from "@/shared/api/unwrapGatewayResponse";
import { hasClientSession } from "@/shared/auth/clientSession";
import { useAuthStore } from "@/shared/store/authStore";

export function useAuth() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const accessTokenExpiresAt = useAuthStore((s) => s.accessTokenExpiresAt);
  const hydrated = useAuthStore((s) => s.hydrated);
  const setTokens = useAuthStore((s) => s.setTokens);

  const isAuthenticated =
    hydrated &&
    hasClientSession({ accessToken, refreshToken, accessTokenExpiresAt });

  const navigateAfterAuth = useCallback(
    (from?: string) => {
      navigate("/company-select", {
        replace: true,
        state: from ? { from } : undefined,
      });
    },
    [navigate],
  );

  const login = useCallback(
    async (email: string, password: string, from?: string) => {
      const fieldErrors = validateLoginFields(email, password);
      if (Object.keys(fieldErrors).length > 0) {
        return { ok: false as const, fieldErrors, message: Object.values(fieldErrors)[0] };
      }

      try {
        const res = await authApi.login({ email: email.trim(), password });
        const data = unwrapGatewayResponse<unknown>(res.data);
        const tokens = extractTokenPayload(data);
        if (!tokens) {
          return { ok: false as const, message: "登录成功但未返回令牌" };
        }
        setTokens(tokens);
        navigateAfterAuth(from);
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, message: extractLoginError(err) };
      }
    },
    [navigateAfterAuth, setTokens],
  );

  const sendRegistrationVerificationCode = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) {
      return { ok: false as const, message: "请先填写邮箱" };
    }
    if (!isValidEmail(trimmed)) {
      return { ok: false as const, message: "请输入有效的邮箱地址" };
    }

    try {
      const res = await authApi.sendRegistrationVerificationCode(trimmed);
      const data = unwrapGatewayResponse<{ message?: string }>(res.data);
      return {
        ok: true as const,
        message: data.message ?? "验证码已发送，请查收邮件（10 分钟内有效）。",
      };
    } catch (err) {
      return { ok: false as const, message: extractApiError(err, "发送验证码失败，请稍后重试") };
    }
  }, []);

  const register = useCallback(
    async (input: {
      username: string;
      email: string;
      password: string;
      verificationCode?: string;
    }) => {
      const fieldErrors = validateRegisterFields(input);
      if (Object.keys(fieldErrors).length > 0) {
        return { ok: false as const, fieldErrors, message: Object.values(fieldErrors)[0] };
      }

      const usernameResult = normalizeUsername(input.username);
      if ("error" in usernameResult) {
        return {
          ok: false as const,
          fieldErrors: { username: usernameResult.error },
          message: usernameResult.error,
        };
      }

      try {
        const payload: Parameters<typeof authApi.register>[0] = {
          username: usernameResult.value,
          email: input.email.trim(),
          password: input.password,
        };
        if (isRegisterEmailVerificationEnabled()) {
          payload.verificationCode = input.verificationCode?.trim();
        }
        const res = await authApi.register(payload);
        const data = unwrapGatewayResponse<unknown>(res.data);
        const tokens = extractTokenPayload(data);
        if (tokens) {
          setTokens(tokens);
          navigateAfterAuth();
          return { ok: true as const, autoLogin: true as const };
        }
        navigate("/login", {
          replace: true,
          state: { registered: true, registeredEmail: input.email.trim() },
        });
        return { ok: true as const, autoLogin: false as const };
      } catch (err) {
        return { ok: false as const, message: extractRegisterError(err) };
      }
    },
    [navigate, navigateAfterAuth, setTokens],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const res = await authApi.forgotPassword(email.trim());
      const data = unwrapGatewayResponse<{ message?: string }>(res.data);
      return { ok: true as const, message: data.message ?? "如果该邮箱已注册，我们已发送密码重置链接。" };
    } catch (err) {
      return { ok: false as const, message: extractForgotPasswordError(err) };
    }
  }, []);

  const sendResetPasswordCode = useCallback(async (email: string) => {
    try {
      const res = await authApi.sendResetPasswordCode(email.trim());
      const data = unwrapGatewayResponse<{ message?: string }>(res.data);
      return { ok: true as const, message: data.message ?? "验证码已发送，请查收邮件（10 分钟内有效）。" };
    } catch (err) {
      return { ok: false as const, message: extractForgotPasswordError(err) };
    }
  }, []);

  const resetPasswordWithCode = useCallback(async (email: string, code: string, newPassword: string, confirmPassword: string) => {
    const fieldErrors = validatePasswordPair(newPassword, confirmPassword);
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false as const, fieldErrors };
    }

    try {
      const res = await authApi.resetPasswordWithCode(email.trim(), code.trim(), newPassword);
      const data = unwrapGatewayResponse<{ message?: string }>(res.data);
      return { ok: true as const, message: data.message ?? "密码已重置，请使用新密码登录。" };
    } catch (err) {
      return { ok: false as const, message: extractResetPasswordError(err) };
    }
  }, []);

  const resetPassword = useCallback(async (token: string, password: string, confirmPassword: string) => {
    const fieldErrors = validatePasswordPair(password, confirmPassword);
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false as const, fieldErrors };
    }

    try {
      const res = await authApi.resetPassword(token.trim(), password);
      const data = unwrapGatewayResponse<{ message?: string }>(res.data);
      return { ok: true as const, message: data.message ?? "密码已重置，请使用新密码登录。" };
    } catch (err) {
      return { ok: false as const, message: extractResetPasswordError(err) };
    }
  }, []);

  const completeOAuthLogin = useCallback(
    (tokens: { accessToken: string; refreshToken: string; expiresIn?: number }, from?: string) => {
      setTokens(tokens);
      navigateAfterAuth(from);
    },
    [navigateAfterAuth, setTokens],
  );

  const logout = useCallback(async () => {
    await logoutUser();
  }, []);

  return {
    accessToken,
    refreshToken,
    hydrated,
    isAuthenticated,
    login,
    register,
    sendRegistrationVerificationCode,
    requestPasswordReset,
    sendResetPasswordCode,
    resetPasswordWithCode,
    resetPassword,
    completeOAuthLogin,
    logout,
    resolvePostAuthDestination,
  };
}
