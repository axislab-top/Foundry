/**
 * LangGraph / Tool 侧：将记忆命中格式化为可注入 prompt 的 RAG 上下文。
 * API 本体在 apps/api MemoryRetrieverService；此处仅做纯函数拼接，避免运行时耦仓储。
 */

export interface MemoryRagHit {
  content: string;
  score: number;
  namespace?: string;
  sourceType?: string;
}

export function buildRagPromptFromHits(
  hits: MemoryRagHit[],
  opts?: { maxChars?: number; header?: string },
): string {
  const maxChars = opts?.maxChars ?? 12000;
  const header =
    opts?.header ??
    '以下是与当前任务相关的公司记忆片段（按相关度排序），请仅在有把握时引用，并避免泄露敏感脱敏条目。';
  const lines: string[] = [header, ''];
  let used = lines.join('\n').length;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const meta = [
      h.namespace ? `ns=${h.namespace}` : '',
      h.sourceType ? `src=${h.sourceType}` : '',
      `score=${h.score.toFixed(4)}`,
    ]
      .filter(Boolean)
      .join(' ');
    const chunk = `### [${i + 1}] ${meta}\n${h.content.trim()}\n`;
    if (used + chunk.length > maxChars) break;
    lines.push(chunk);
    used += chunk.length;
  }
  return lines.join('\n').trim();
}
