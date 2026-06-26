import type { OpenAiFunctionTool } from '@service/ai';

export type CeoV2ToolSurfaceLayer = 'planning' | 'orchestration' | 'supervision';

/**
 * 按层 allowlist 裁剪合并后的 OpenAI tools（在 dedupe 之前调用）。
 * `mode=off` 或空 allowlist：不裁剪。`strict`：存在未允许的工具名则抛错。
 */
export function applyCeoV2ToolSurface(params: {
  layer: CeoV2ToolSurfaceLayer;
  mode: 'off' | 'warn' | 'strict';
  allowlist: string[];
  tools: OpenAiFunctionTool[];
}): { tools: OpenAiFunctionTool[]; droppedByAllowlist: string[] } {
  if (params.mode === 'off' || !params.allowlist.length) {
    return { tools: params.tools, droppedByAllowlist: [] };
  }
  const allow = new Set(params.allowlist.map((n) => String(n ?? '').trim()).filter(Boolean));
  const kept: OpenAiFunctionTool[] = [];
  const droppedByAllowlist: string[] = [];
  for (const t of params.tools) {
    const name = String(t.function?.name ?? '').trim();
    if (!name) continue;
    if (allow.has(name)) kept.push(t);
    else droppedByAllowlist.push(name);
  }
  if (params.mode === 'strict' && droppedByAllowlist.length) {
    throw new Error(
      `ceo_v2.tool_surface.strict_violation:${params.layer}:${droppedByAllowlist.slice(0, 24).join(',')}`,
    );
  }
  return { tools: kept, droppedByAllowlist };
}
