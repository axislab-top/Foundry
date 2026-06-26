import type { CeoV2ToolDefinition } from '@contracts/types';
import { ORCHESTRATION_TOOLS } from '../pipeline-v2/pipeline-v2-orchestration.constants.js';
import { REPLAY_PEER_SUMMON_TOOLS } from './replay-peer-summon-tools.js';

const REPLAY_TOOL_NAMES = ['memory.search', 'facts.company.query'] as const;

/**
 * Replay 委托 / natural_reply 静态回退：与 orchestration canonical 前两项 schema 一致，
 * 并 **始终** 附带主群 Agent 间协调工具（message_send_to_agent）。
 */
export const REPLAY_CANONICAL_TOOLS: CeoV2ToolDefinition[] = [
  ...ORCHESTRATION_TOOLS.filter((t) =>
    REPLAY_TOOL_NAMES.includes(t.function.name as (typeof REPLAY_TOOL_NAMES)[number]),
  ),
  ...REPLAY_PEER_SUMMON_TOOLS,
];

export const REPLAY_ALLOWED_TOOL_NAMES = new Set<string>(REPLAY_TOOL_NAMES);

/** canonical 记忆/事实工具与 replay 层 skill 工具并集（按 function.name 去重，layer 优先）。 */
export function mergeReplayToolSurface(
  layerTools: ReadonlyArray<{ function?: { name?: string } }>,
): CeoV2ToolDefinition[] {
  const byName = new Map<string, CeoV2ToolDefinition>();
  for (const t of REPLAY_CANONICAL_TOOLS) {
    byName.set(t.function.name, t);
  }
  for (const t of layerTools) {
    const name = String(t.function?.name ?? '').trim();
    if (name) {
      byName.set(name, t as CeoV2ToolDefinition);
    }
  }
  return [...byName.values()];
}
