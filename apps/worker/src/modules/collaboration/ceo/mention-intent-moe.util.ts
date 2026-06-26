/** CEO MoE @mention 轮次路由（与 Intent 受众路由无关）。 */
import type { PendingMentionEntry } from './dto/ceo-v2-pipeline.types.js';

export type MentionIntentRoute = 'draft-mention' | 'confirmed-execution' | 'idle-confirm';

const EXEC_CONFIRM_RE =
  /(现在分配|交给你|指派给你|请你现在执行|立即执行|马上执行|开始执行|落地执行|分配任务|创建任务并开始|转\s*L3|进入\s*L3|继续执行|继续推进|展开执行|开始编排|进入执行)/i;

export function parsePendingMentions(raw: unknown): Record<string, PendingMentionEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, PendingMentionEntry> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(k ?? '').trim();
    if (!id || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const rec = v as Record<string, unknown>;
    const stage = rec.stage === 'confirmed' ? 'confirmed' : rec.stage === 'draft' ? 'draft' : null;
    const round = Number.isFinite(rec.round) ? Math.max(1, Math.floor(Number(rec.round))) : null;
    if (!stage || !round) continue;
    out[id] = { stage, round };
  }
  return out;
}

function prunePendingForRound(
  pending: Record<string, PendingMentionEntry>,
  currentRound: number,
): Record<string, PendingMentionEntry> {
  const r = Math.max(1, Math.floor(currentRound));
  const next: Record<string, PendingMentionEntry> = {};
  for (const [id, e] of Object.entries(pending)) if (e.round >= r) next[id] = e;
  return next;
}

export function routeMentionIntentMoe(params: {
  contentText: string;
  mentionedAgentIds: string[];
  currentRound: number;
  pendingMentions: Record<string, PendingMentionEntry>;
  repliedAgentIds?: string[];
}): { route: MentionIntentRoute; duplicateIdleAgents: string[]; shortCircuit: boolean } {
  const text = (params.contentText ?? '').trim();
  const round = Math.max(1, Math.floor(params.currentRound || 1));
  const mentions = [...new Set((params.mentionedAgentIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))];
  const pending = params.pendingMentions ?? {};
  const replied = new Set((params.repliedAgentIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean));
  const duplicateIdleAgents = mentions.filter((id) => {
    const prev = pending[id];
    return Boolean(prev && prev.round === round);
  });
  if (mentions.length > 0 && duplicateIdleAgents.length > 0) {
    const allDup = duplicateIdleAgents.length === mentions.length;
    const allDupAlreadyReplied = allDup && duplicateIdleAgents.every((agentId) => replied.has(agentId));
    return {
      route: allDupAlreadyReplied ? 'idle-confirm' : 'draft-mention',
      duplicateIdleAgents,
      shortCircuit: allDupAlreadyReplied,
    };
  }
  if (EXEC_CONFIRM_RE.test(text)) return { route: 'confirmed-execution', duplicateIdleAgents: [], shortCircuit: false };
  return { route: 'draft-mention', duplicateIdleAgents: [], shortCircuit: false };
}

export function executeIntentClassifyMcp(args: Record<string, unknown>): Record<string, unknown> {
  const contentText = String(args.messageText ?? args.contentText ?? '').trim();
  const mentionedAgentIds = Array.isArray(args.mentionedAgentIds)
    ? (args.mentionedAgentIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  const currentRound =
    args.currentRound !== undefined && Number.isFinite(Number(args.currentRound))
      ? Math.max(1, Math.floor(Number(args.currentRound)))
      : 1;
  let pending: Record<string, PendingMentionEntry> = {};
  if (typeof args.pendingMentionsJson === 'string' && args.pendingMentionsJson.trim()) {
    try {
      pending = parsePendingMentions(JSON.parse(args.pendingMentionsJson) as unknown);
    } catch {
      pending = {};
    }
  } else if (args.pendingMentions && typeof args.pendingMentions === 'object') {
    pending = parsePendingMentions(args.pendingMentions);
  }
  const routed = routeMentionIntentMoe({
    contentText,
    mentionedAgentIds,
    currentRound,
    pendingMentions: pending,
    repliedAgentIds: Array.isArray(args.repliedAgentIds)
      ? (args.repliedAgentIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [],
  });
  return {
    ok: true,
    mentionIntentRoute: routed.route,
    shortCircuit: routed.shortCircuit,
    duplicateAgentIds: routed.duplicateIdleAgents,
    currentRound,
  };
}

export function mergePendingMentionsAfterRoute(params: {
  previous: Record<string, PendingMentionEntry>;
  route: MentionIntentRoute;
  mentionedAgentIds: string[];
  currentRound: number;
}): Record<string, PendingMentionEntry> {
  const round = Math.max(1, Math.floor(params.currentRound || 1));
  const base = prunePendingForRound(params.previous, round);
  if (params.route === 'idle-confirm') return base;
  for (const id of params.mentionedAgentIds.map((x) => String(x ?? '').trim()).filter(Boolean)) {
    if (params.route === 'confirmed-execution') {
      base[id] = { stage: 'confirmed', round };
    } else if (params.route === 'draft-mention') {
      const cur = base[id];
      if (!cur || cur.round < round) base[id] = { stage: 'draft', round };
    }
  }
  return base;
}
