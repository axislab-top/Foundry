/**
 * 火山方舟 API 基址（含 path 的 URL 也可用，仅看 host 片段）。
 * 此类服务上部分模型（如 doubao-embedding-vision-*）**仅**支持 `/embeddings/multimodal`，
 * 调用同 base 的 `/embeddings` 会返回「model does not support this api」类 400。
 */
export function isVolcengineArkEmbeddingsBaseUrl(baseOrFullUrl: string): boolean {
  const u = String(baseOrFullUrl ?? '').toLowerCase();
  return u.includes('volces.com') || u.includes('bytepluses.com');
}

/**
 * 方舟上 `doubao-embedding-vision-*` 等：**不能**再走同 base 的纯 `/embeddings`，
 * 否则稳定 400；且该错误会覆盖 multimodal 上更早失败的真实原因，排障困难。
 */
export function isVolcArkVisionEmbeddingModelName(modelName: string): boolean {
  return /\bembedding-vision\b/i.test(String(modelName ?? ''));
}

/**
 * `llm_models.embedding_dimensions` 为空时的输出维推断；无法推断返回 null，由 MEMORY_EMBEDDING_DIMENSIONS 与池内 expectedDimensions 兜底。
 */
export function inferEmbeddingDimensionsFromModelName(modelName: string): number | null {
  if (/\bembedding-vision\b/i.test(String(modelName ?? ''))) return 2048;
  return null;
}

/**
 * 火山方舟等：`/embeddings`（非 multimodal）仅接受 `input` 为 string 或 string[]，
 * 发送 `[{ type: 'text', text }]` 会报「map 而非 string」类错误。
 */
export function embeddingsPathExpectsStringInputOnly(endpointUrl: string): boolean {
  const u = String(endpointUrl ?? '').toLowerCase();
  if (u.includes('/embeddings/multimodal')) return false;
  if (!u.includes('/embeddings')) return false;
  return (
    u.includes('volces.com') || u.includes('volcengine') || u.includes('bytepluses.com')
  );
}
