import { isAxiosError } from "axios";

type GatewayErrorPayload = {
  success?: boolean;
  error?: {
    message?: string | string[];
    code?: string;
    details?: unknown;
  };
  message?: string | string[];
};

const STATUS_FALLBACKS: Record<number, string> = {
  400: "请求参数无效，请检查输入",
  401: "邮箱或密码错误",
  409: "该邮箱已被注册",
  429: "登录尝试过于频繁，请稍后再试",
};

function formatValidationDetail(details: unknown): string | undefined {
  if (!details) return undefined;
  if (Array.isArray(details)) {
    const messages = details
      .map((item) => {
        if (typeof item === "string" && item.trim()) return item.trim();
        if (item && typeof item === "object" && "message" in item) {
          const msg = (item as { message?: unknown }).message;
          return typeof msg === "string" && msg.trim() ? msg.trim() : undefined;
        }
        return undefined;
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join("；") : undefined;
  }
  if (typeof details === "object" && details !== null) {
    const values = Object.values(details as Record<string, unknown>)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return values.length > 0 ? values.join("；") : undefined;
  }
  return undefined;
}

function extractMessageFromPayload(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const payload = data as GatewayErrorPayload;

  const fromDetails = formatValidationDetail(payload.error?.details);
  if (fromDetails) return fromDetails;

  const nested = payload.error?.message;
  if (Array.isArray(nested)) {
    const joined = nested.filter((m) => typeof m === "string" && m.trim()).join("；");
    if (joined) return joined;
  }
  if (typeof nested === "string" && nested.trim().length > 0) return nested.trim();

  if (Array.isArray(payload.message)) {
    const joined = payload.message.filter((m) => typeof m === "string" && m.trim()).join("；");
    if (joined) return joined;
  }
  if (typeof payload.message === "string" && payload.message.trim().length > 0) {
    return payload.message.trim();
  }

  return undefined;
}

export function extractApiError(error: unknown, fallback = "请求失败，请稍后重试"): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const fromPayload = extractMessageFromPayload(error.response?.data);
    if (fromPayload) return fromPayload;
    if (status != null && STATUS_FALLBACKS[status]) return STATUS_FALLBACKS[status];
    if (status != null) return `请求失败 (HTTP ${status})`;
    if (error.message) return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function extractLoginError(error: unknown): string {
  return extractApiError(error, "登录失败，请检查账号和密码");
}

export function extractRegisterError(error: unknown): string {
  return extractApiError(error, "注册失败，请稍后重试");
}

export function extractForgotPasswordError(error: unknown): string {
  return extractApiError(error, "发送重置邮件失败，请稍后重试");
}

export function extractResetPasswordError(error: unknown): string {
  return extractApiError(error, "密码重置失败，请检查链接是否有效");
}
