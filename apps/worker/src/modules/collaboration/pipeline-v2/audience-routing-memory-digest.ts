import type { MemorySearchResult } from '../context/collaboration-execution-context.js';
import {
  AUDIENCE_ROUTING_MEMORY_DIGEST_BUILDER_CAP_DIGEST,
  AUDIENCE_ROUTING_MEMORY_DIGEST_BUILDER_CAP_FULL,
} from '../intent/audience-routing-llm-limits.js';

/**
 * 将 lead memory 命中压缩为受众路由 LLM 可读的短上下文（`digest` / `full`）。
 */
export function buildAudienceRoutingMemoryDigest(
  hits: MemorySearchResult[] | undefined,
  mode: 'digest' | 'full',
): string {
  const list = Array.isArray(hits) ? hits : [];
  if (!list.length) return '';
  const cap = mode === 'full' ? AUDIENCE_ROUTING_MEMORY_DIGEST_BUILDER_CAP_FULL : AUDIENCE_ROUTING_MEMORY_DIGEST_BUILDER_CAP_DIGEST;
  const perSnippet = mode === 'full' ? 480 : 160;
  const lines: string[] = [];
  let used = 0;
  for (let i = 0; i < list.length && used < cap; i += 1) {
    const h = list[i]!;
    const id = String((h as { id?: string }).id ?? (h as { memoryEntryId?: string }).memoryEntryId ?? i).slice(0, 64);
    const ns = String((h as { namespace?: string }).namespace ?? '').slice(0, 120);
    const sn = String((h as { snippet?: string }).snippet ?? (h as { content?: string }).content ?? '').slice(
      0,
      perSnippet,
    );
    const line = `- [${id}]${ns ? ` ${ns}` : ''}: ${sn}`;
    if (used + line.length > cap) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}
