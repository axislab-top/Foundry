/**
 * Redact secrets from URLs and header-like records before logging or trace export.
 */

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

export function redactUrlCredentials(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = '';
      u.password = '';
    }
    u.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('key') ||
        lower.includes('secret') ||
        lower.includes('password')
      ) {
        u.searchParams.set(key, '[REDACTED]');
      }
    });
    return u.toString();
  } catch {
    return url.replace(/\/\/([^@/]+)@/g, '//[REDACTED]@');
  }
}

export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (SENSITIVE_HEADER_KEYS.has(key)) {
      out[k] = '[REDACTED]';
    } else {
      const val = Array.isArray(v) ? v.join(',') : v ?? '';
      out[k] = val;
    }
  }
  return out;
}
