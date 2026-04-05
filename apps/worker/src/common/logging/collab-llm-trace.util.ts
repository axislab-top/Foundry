/**
 * 协作 / CEO LLM 全链路排障：日志里搜 `collab-llm-trace` 即可串起来。
 * 禁止记录完整 API Key。
 */
export const COLLAB_LLM_TRACE = 'collab-llm-trace';

export function llmSecretFingerprint(secret: string | undefined | null): string {
  if (secret == null || secret === '') return '(empty)';
  const t = secret.trim();
  if (!t) return '(whitespace-only)';
  if (t.length < 8) return `len=${t.length}`;
  return `${t.slice(0, 6)}…${t.slice(-4)} len=${t.length}`;
}

export function safeLlmBaseUrlForLog(url: string | undefined | null): string {
  if (!url?.trim()) return '(default)';
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return `${u.protocol}//${u.host}${path}`.slice(0, 180);
  } catch {
    return '(invalid-url)';
  }
}
