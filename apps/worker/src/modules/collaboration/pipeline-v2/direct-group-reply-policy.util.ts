import type { CollaborationIntentDecisionV20261, IntentDecision } from '@contracts/types';

/**
 * 固定并发执行 async 任务，**结果数组下标与 `items` 顺序一致**（非完成先后序）。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(n);
  let cursor = 0;
  const workerCount = Math.min(limit, n);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= n) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 主群 `audience_resolution` 且多目标直连时：若用户未 @ CEO，从 summon 列表中移除 CEO，
 * 避免「各部门主管自我介绍」时 CEO 与主管同批被误点。
 */
export function stripCeoFromAudienceMultiSummonTargets(params: {
  targetAgentIds: readonly string[];
  ceoAgentId?: string | null;
  intentType?: string | null;
  mentionedAgentIds?: readonly string[] | null;
  enabled: boolean;
}): string[] {
  const ids = [...new Set(params.targetAgentIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (!params.enabled || ids.length <= 1) return ids;
  if (String(params.intentType ?? '').trim() !== 'audience_resolution') return ids;
  const ceo = String(params.ceoAgentId ?? '').trim();
  if (!ceo || !ids.includes(ceo)) return ids;
  const mentioned = new Set((params.mentionedAgentIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean));
  if (mentioned.has(ceo)) return ids;
  const rest = ids.filter((id) => id !== ceo);
  return rest.length > 0 ? rest : ids;
}

/** Unified `userFacingReply`（服务端填充）中易诱发「主持复读」的句式（多目标直连时弱化）。 */
const HOST_LIKE_USER_FACING = /请[^。]{0,32}(依次|各自)|依次[^。]{0,16}介绍|各位[^。]{0,16}主管[^。]{0,12}(依次|各自|介绍)/;

export function sanitizeUnifiedUserFacingForMultiDirectGroup(
  unified: CollaborationIntentDecisionV20261 | undefined,
  directTargetCount: number,
  enabled: boolean,
): CollaborationIntentDecisionV20261 | undefined {
  if (!unified || !enabled || directTargetCount <= 1) return unified;
  const raw = String(unified.userFacingReply?.text ?? '').trim();
  if (!raw || !HOST_LIKE_USER_FACING.test(raw)) return unified;
  return {
    ...unified,
    userFacingReply: { text: '好的。' },
  };
}

export function patchUnifiedRoutingTargetIds(
  unified: CollaborationIntentDecisionV20261 | undefined,
  targetAgentIds: readonly string[],
): CollaborationIntentDecisionV20261 | undefined {
  if (!unified) return undefined;
  const rh = unified.routingHints ?? ({} as NonNullable<CollaborationIntentDecisionV20261['routingHints']>);
  return {
    ...unified,
    routingHints: {
      ...rh,
      targetAgentIds: [...targetAgentIds],
      requiresParallelism: targetAgentIds.length > 1,
    },
  };
}

export function intentDecisionWithResolvedTargetIds(
  intentDecision: IntentDecision,
  targetAgentIds: readonly string[],
): IntentDecision {
  const prevMeta =
    intentDecision.metadata && typeof intentDecision.metadata === 'object'
      ? (intentDecision.metadata as Record<string, unknown>)
      : {};
  const meta: Record<string, unknown> = { ...prevMeta, resolvedTargetAgentIds: [...targetAgentIds] };
  const n = targetAgentIds.length;
  return {
    ...intentDecision,
    targetIds: [...targetAgentIds],
    targetMode: n > 1 ? 'multi_agent' : 'single_agent',
    metadata: meta,
  };
}
