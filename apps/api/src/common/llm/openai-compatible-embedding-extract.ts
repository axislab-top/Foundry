/**
 * 从 OpenAI 兼容的 embeddings HTTP JSON 中取出向量。
 *
 * - 标准 OpenAI：`{ data: [{ embedding: number[] }] }`
 * - 部分厂商（如火山方舟 `/embeddings/multimodal`）：`{ data: { embedding: number[] } }`
 */
export function extractEmbeddingVectorFromEmbeddingsJson(json: unknown): number[] | null {
  if (!json || typeof json !== 'object') return null;
  const data = (json as { data?: unknown }).data;
  if (Array.isArray(data)) {
    const first = data[0] as { embedding?: unknown } | undefined;
    const emb = first?.embedding;
    if (!Array.isArray(emb) || emb.length === 0) return null;
    if (typeof emb[0] !== 'number' || !Number.isFinite(emb[0])) return null;
    return emb as number[];
  }
  if (data && typeof data === 'object' && 'embedding' in data) {
    const emb = (data as { embedding: unknown }).embedding;
    if (!Array.isArray(emb) || emb.length === 0) return null;
    if (typeof emb[0] !== 'number' || !Number.isFinite(emb[0])) return null;
    return emb as number[];
  }
  return null;
}
