import type { DirectCollabGeneratedReply } from './direct-reply-output.types.js';

export const DIRECT_REPLY_LENGTH_LIMIT_NOTICE =
  '\n\n---\n（回复已达单次生成长度上限，输入「继续」可让我补全剩余内容。）';

export const DIRECT_REPLY_EXTREME_CAP_NOTICE =
  '\n\n---\n（回复过长，以上为可展示部分；如需全文请说明「导出完整版」或拆分为任务交付物。）';

export const DIRECT_REPLY_CONTINUATION_HUMAN =
  '请从上次中断处接着写，不要重复已写内容，保持同一语气与结构，直接续写正文。';

/** LangChain / OpenAI 兼容：从模型响应读取 finish_reason。 */
export function extractLlmFinishReason(msg: unknown): string | null {
  const m = msg as Record<string, unknown> | null;
  if (!m) return null;
  const meta = m.response_metadata as Record<string, unknown> | undefined;
  const fromMeta = meta?.finish_reason ?? meta?.finishReason;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  const kwargs = m.additional_kwargs as Record<string, unknown> | undefined;
  const fromKw = kwargs?.finish_reason ?? kwargs?.finishReason;
  if (typeof fromKw === 'string' && fromKw.trim()) return fromKw.trim();
  return null;
}

export function extractLlmTextContent(msg: unknown): string {
  const m = msg as { content?: unknown } | null;
  const c = m?.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: string }).text ?? '');
        }
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

export function isLengthFinishReason(finishReason: string | null | undefined): boolean {
  const fr = String(finishReason ?? '')
    .trim()
    .toLowerCase();
  return fr === 'length' || fr === 'max_tokens' || fr === 'token_limit';
}

export type FinalizeUserVisibleReplyParams = {
  text: string;
  hardCapChars: number;
  truncatedByLength?: boolean;
};

export type FinalizeUserVisibleReplyResult = {
  text: string;
  extremeCapApplied: boolean;
  originalCharLength: number;
};

/**
 * 用户可见层：保留完整正文；仅在极端长度时截断并追加明示说明（禁止静默 slice）。
 */
export function finalizeUserVisibleReplyText(
  params: FinalizeUserVisibleReplyParams,
): FinalizeUserVisibleReplyResult {
  const raw = String(params.text ?? '').trim();
  const originalCharLength = raw.length;
  if (!raw) {
    return { text: '', extremeCapApplied: false, originalCharLength: 0 };
  }

  const cap = Math.max(4000, Math.floor(params.hardCapChars));
  let text = raw;
  let extremeCapApplied = false;

  if (text.length > cap) {
    text = text.slice(0, cap).trimEnd() + DIRECT_REPLY_EXTREME_CAP_NOTICE;
    extremeCapApplied = true;
  } else if (params.truncatedByLength) {
    text = text + DIRECT_REPLY_LENGTH_LIMIT_NOTICE;
  }

  return { text, extremeCapApplied, originalCharLength };
}

export function buildDirectCollabGeneratedReply(params: {
  text: string;
  finishReason?: string | null;
  truncatedByLength: boolean;
  continuationRounds: number;
  hardCapChars: number;
  tokenStreamed?: boolean;
}): DirectCollabGeneratedReply | null {
  const trimmed = String(params.text ?? '').trim();
  if (!trimmed) return null;

  const finalized = finalizeUserVisibleReplyText({
    text: trimmed,
    hardCapChars: params.hardCapChars,
    truncatedByLength: params.truncatedByLength,
  });

  return {
    text: finalized.text,
    finishReason: params.finishReason ?? null,
    truncatedByLength: params.truncatedByLength,
    continuationRounds: Math.max(0, Math.floor(params.continuationRounds)),
    extremeCapApplied: finalized.extremeCapApplied,
    originalCharLength: finalized.originalCharLength,
    tokenStreamed: params.tokenStreamed === true,
  };
}

/** 模拟流式分块（与心跳汇报一致：按字符切分，保留完整语义）。 */
export function splitTextForStreamChunks(text: string, chunkSize: number): string[] {
  const body = String(text ?? '');
  if (!body.trim()) return [];
  const size = Math.max(48, Math.min(1200, Math.floor(chunkSize)));
  const chunks: string[] = [];
  for (let i = 0; i < body.length; i += size) {
    const chunk = body.slice(i, i + size);
    if (chunk.length) chunks.push(chunk);
  }
  return chunks;
}

export function toDirectReplyGenerationMetadata(
  generated: DirectCollabGeneratedReply,
  streamed: boolean,
): Record<string, unknown> {
  const tokenStreamed = generated.tokenStreamed === true;
  return {
    finishReason: generated.finishReason ?? null,
    truncatedByLength: generated.truncatedByLength,
    continuationRounds: generated.continuationRounds,
    extremeCapApplied: generated.extremeCapApplied,
    originalCharLength: generated.originalCharLength,
    streamed: streamed || tokenStreamed,
    tokenStreamed,
    outputComplete: !generated.truncatedByLength,
  };
}
