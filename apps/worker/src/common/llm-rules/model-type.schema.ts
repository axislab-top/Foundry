import { z } from 'zod';

export const DEFAULT_EMBEDDING_MODEL_PATTERNS = [
  'embedding',
  'text-embedding',
  'bge-',
  'vector',
] as const;

export const chatModelSchema = z.string().min(1).brand<'ChatModel'>();
export const embeddingModelSchema = z.string().min(1).brand<'EmbeddingModel'>();

export type ChatModel = z.infer<typeof chatModelSchema>;
export type EmbeddingModel = z.infer<typeof embeddingModelSchema>;

export function isEmbeddingLikeByPatterns(
  modelOrKey: string | null | undefined,
  patterns: readonly string[] = DEFAULT_EMBEDDING_MODEL_PATTERNS,
): boolean {
  const n = String(modelOrKey ?? '').trim().toLowerCase();
  if (!n) return false;
  return patterns.some((p) => {
    const raw = String(p ?? '').trim();
    if (!raw) return false;
    const re = new RegExp(raw, 'i');
    return re.test(n);
  });
}
