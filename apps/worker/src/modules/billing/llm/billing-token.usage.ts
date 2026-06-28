import type { BaseMessage } from '@langchain/core/messages';

/**
 * 从 LangChain / OpenAI 兼容的模型返回中抽取 token usage（优先 SDK）。
 */
export function extractUsage(raw: unknown): { input: number; output: number } | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;

  const usageRaw =
    r.usage ??
    (r.response_metadata as Record<string, unknown> | undefined)?.usage ??
    r.usage_metadata ??
    (r.lc_kwargs as Record<string, unknown> | undefined)?.usage;

  if (!usageRaw || typeof usageRaw !== 'object') {
    return null;
  }
  const u = usageRaw as Record<string, unknown>;
  const pin = u.prompt_tokens ?? u.input_tokens ?? u.promptTokens;
  const pout = u.completion_tokens ?? u.output_tokens ?? u.completionTokens;
  if (typeof pin === 'number' && typeof pout === 'number' && Number.isFinite(pin) && Number.isFinite(pout)) {
    return { input: Math.max(0, Math.floor(pin)), output: Math.max(0, Math.floor(pout)) };
  }
  return null;
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'object' && c !== null ? JSON.stringify(c) : String(c))).join('');
  }
  if (content == null) {
    return '';
  }
  return JSON.stringify(content);
}

/**
 * 简易字符估算：与 CEO plan 路径一致（≈4 chars / token），仅作兜底。
 */
export function estimateFromMessages(messages: BaseMessage[], outputText: string): { input: number; output: number } {
  const est = (s: string): number => Math.max(1, Math.ceil(s.length / 4));
  const inStr = messages.map((m) => stringifyMessageContent(m.content)).join('\n');
  return {
    input: est(inStr),
    output: est(outputText.length > 0 ? outputText : ' '),
  };
}

/** LangGraph / LangChain chunk → 可拼接文本 */
export function stringifyLlmChunk(chunk: unknown): string {
  if (chunk == null) {
    return '';
  }
  if (typeof chunk === 'object' && chunk !== null && 'content' in chunk) {
    const c = (chunk as { content: unknown }).content;
    if (typeof c === 'string') {
      return c;
    }
    if (Array.isArray(c)) {
      return c.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('');
    }
  }
  return '';
}

/**
 * 流式末尾 chunk 有时携带累计 usage（取决于 provider）。
 */
export function extractUsageFromStreamTail(lastChunk: unknown): { input: number; output: number } | null {
  return extractUsage(lastChunk);
}
