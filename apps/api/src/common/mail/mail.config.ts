export type SmtpMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 解析 SMTP 配置。未配置 SMTP_HOST 或 MAIL_DEV_LOG_ONLY=true 时返回 null（仅日志模式）。
 */
export function loadSmtpMailConfig(): SmtpMailConfig | null {
  if (parseBoolean(process.env.MAIL_DEV_LOG_ONLY, false)) {
    return null;
  }

  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    return null;
  }

  const port = parsePositiveInt(process.env.SMTP_PORT, 587);
  const secureFromEnv = process.env.SMTP_SECURE?.trim();
  const secure =
    secureFromEnv != null && secureFromEnv !== ''
      ? parseBoolean(secureFromEnv, false)
      : port === 465;

  const from = process.env.SMTP_FROM?.trim() || process.env.MAIL_FROM?.trim();
  if (!from) {
    throw new Error(
      'SMTP_HOST is set but SMTP_FROM (or MAIL_FROM) is missing. Set a valid sender address.',
    );
  }

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  return {
    host,
    port,
    secure,
    from,
    user: user || undefined,
    pass: pass || undefined,
    connectionTimeoutMs: parsePositiveInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10_000),
    greetingTimeoutMs: parsePositiveInt(process.env.SMTP_GREETING_TIMEOUT_MS, 10_000),
    socketTimeoutMs: parsePositiveInt(process.env.SMTP_SOCKET_TIMEOUT_MS, 10_000),
  };
}

export function isSmtpConfigured(): boolean {
  try {
    return loadSmtpMailConfig() != null;
  } catch {
    return false;
  }
}
