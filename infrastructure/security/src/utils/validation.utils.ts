/**
 * 验证工具函数
 */

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证密码强度
 */
export interface PasswordStrength {
  score: number; // 0-4
  feedback: string[];
}

export function validatePasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < 8) {
    feedback.push('密码长度至少为 8 个字符');
  } else {
    score++;
  }

  if (!/[a-z]/.test(password)) {
    feedback.push('密码应包含小写字母');
  } else {
    score++;
  }

  if (!/[A-Z]/.test(password)) {
    feedback.push('密码应包含大写字母');
  } else {
    score++;
  }

  if (!/[0-9]/.test(password)) {
    feedback.push('密码应包含数字');
  } else {
    score++;
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    feedback.push('密码应包含特殊字符');
  } else {
    score++;
  }

  return {
    score: Math.min(score, 4),
    feedback,
  };
}

/**
 * 验证 JWT 令牌格式
 */
export function isValidJwtFormat(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * 验证 UUID 格式
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 验证 API Key 格式（自定义格式）
 */
export function isValidApiKeyFormat(apiKey: string, minLength: number = 32): boolean {
  return apiKey.length >= minLength && /^[a-zA-Z0-9_-]+$/.test(apiKey);
}






































