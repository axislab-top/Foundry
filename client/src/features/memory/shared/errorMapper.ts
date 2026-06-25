export function mapMemoryError(error: unknown): string {
  const e = error as any;
  const code =
    e?.response?.data?.response?.code ??
    e?.response?.data?.code ??
    e?.code;
  switch (String(code || "")) {
    case "MEMORY_NAMESPACE_FORBIDDEN":
      return "无权访问该范围记忆。";
    case "MEMORY_STORE_FORBIDDEN":
      return "无权写入该范围记忆。";
    case "MEMORY_EMBED_UNAVAILABLE":
      return "检索服务暂不可用，请稍后重试。";
    case "MEMORY_SEARCH_TIMEOUT":
      return "检索超时，请缩小范围后重试。";
    default:
      return e?.response?.data?.message || e?.message || "记忆服务请求失败。";
  }
}
