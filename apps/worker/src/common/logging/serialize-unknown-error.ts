/**
 * 将未知错误（含 RpcException / 嵌套对象）压成可 JSON 落日志的结构，避免 [object Object]。
 */
export function serializeUnknownErrorForLog(error: unknown, maxDepth = 8): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      kind: 'Error',
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 8000),
    };
  }
  const seen = new WeakSet<object>();
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > maxDepth) return '[MaxDepth]';
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return v;
    if (t === 'symbol') return String(v);
    if (t === 'function') return `[Function ${(v as Function).name || 'anonymous'}]`;
    if (typeof v !== 'object') return String(v);
    if (seen.has(v as object)) return '[Circular]';
    seen.add(v as object);
    if (Array.isArray(v)) {
      return v.slice(0, 200).map((x) => walk(x, depth + 1));
    }
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(o).slice(0, 80);
    for (const k of keys) {
      try {
        out[k] = walk(o[k], depth + 1);
      } catch {
        out[k] = '[Unserializable]';
      }
    }
    return out;
  };
  try {
    return { kind: 'object', body: walk(error, 0) as Record<string, unknown> };
  } catch {
    return { kind: 'fallback', message: String(error) };
  }
}
