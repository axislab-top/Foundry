import { isRegisterEmailVerificationEnabled } from "@/shared/config/env";

/** 与 Gateway RegisterDto / LoginDto 对齐 */
export const MIN_PASSWORD_LENGTH = 6;
export const VERIFICATION_CODE_PATTERN = /^\d{6}$/;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 100;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) return false;
  return EMAIL_PATTERN.test(trimmed);
}

export function validateLoginFields(email: string, password: string): {
  email?: string;
  password?: string;
} {
  const errors: { email?: string; password?: string } = {};
  if (!email.trim()) errors.email = "请输入邮箱";
  else if (!isValidEmail(email)) errors.email = "请输入有效的邮箱地址";
  if (!password) errors.password = "请输入密码";
  else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  }
  return errors;
}

export function validateRegisterFields(input: {
  username: string;
  email: string;
  password: string;
  verificationCode?: string;
}): {
  username?: string;
  email?: string;
  password?: string;
  verificationCode?: string;
} {
  const errors: ReturnType<typeof validateRegisterFields> = {};
  const usernameResult = normalizeUsername(input.username);
  if ("error" in usernameResult) errors.username = usernameResult.error;

  if (!input.email.trim()) errors.email = "请输入邮箱";
  else if (!isValidEmail(input.email)) errors.email = "请输入有效的邮箱地址";

  if (!input.password) errors.password = "请输入密码";
  else if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  } else if (input.password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `密码不能超过 ${MAX_PASSWORD_LENGTH} 位`;
  }

  if (isRegisterEmailVerificationEnabled()) {
    const code = input.verificationCode?.trim() ?? "";
    if (!code) errors.verificationCode = "请输入邮箱验证码";
    else if (!VERIFICATION_CODE_PATTERN.test(code)) {
      errors.verificationCode = "验证码须为 6 位数字";
    }
  }

  return errors;
}

export function validatePasswordPair(password: string, confirmPassword: string): {
  password?: string;
  confirmPassword?: string;
} {
  const errors: { password?: string; confirmPassword?: string } = {};
  if (!password) errors.password = "请输入密码";
  else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `密码不能超过 ${MAX_PASSWORD_LENGTH} 位`;
  }
  if (!confirmPassword) errors.confirmPassword = "请确认密码";
  else if (password && confirmPassword !== password) {
    errors.confirmPassword = "两次输入的密码不一致";
  }
  return errors;
}

export function normalizeUsername(raw: string): { value: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "请输入用户名" };

  let safe = trimmed.replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, "_").replace(/_+/g, "_");
  safe = safe.replace(/^_|_$/g, "");

  if (!safe) safe = "user";
  if (safe.length < MIN_USERNAME_LENGTH) {
    safe = `${safe}${"0".repeat(MIN_USERNAME_LENGTH - safe.length)}`;
  }
  if (safe.length > MAX_USERNAME_LENGTH) {
    return { error: `用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符` };
  }

  return { value: safe };
}
