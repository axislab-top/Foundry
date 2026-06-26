import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { CollaborationPipelineV2RunInput } from '../pipeline-v2/collaboration-pipeline-v2.types.js';
import type { MainRoomDispatchFlushResult } from '../main-room-dispatch-skip.types.js';
import type { MainRoomDispatchCompensationService } from './main-room-dispatch-compensation.service.js';

export function buildMainRoomDispatchSlugToLabelMap(roomContext: RoomContext): Map<string, string> {
  const slugToLabel = new Map<string, string>();
  for (const d of roomContext.orgSnapshot?.departments ?? []) {
    const slug = String((d as { slug?: string }).slug ?? '').trim().toLowerCase();
    const nm = String((d as { name?: string }).name ?? '').trim();
    if (slug && nm) slugToLabel.set(slug, nm);
  }
  return slugToLabel;
}

/**
 * 派发 flush 后：部分部门 skip 时通知主群老板（与 deferred / assign 路径共用）。
 */
export async function notifyMainRoomDispatchPartialFailureIfSkipped(
  compensation: MainRoomDispatchCompensationService,
  params: {
    input: CollaborationPipelineV2RunInput;
    roomContext: RoomContext;
    flushResult: MainRoomDispatchFlushResult;
    parentGoalTaskId: string;
    planMessageId?: string | null;
  },
): Promise<void> {
  const skipped = params.flushResult.skipped ?? [];
  if (!skipped.length) return;

  const ceoId = String(params.input.ceoAgentId ?? '').trim();
  if (!ceoId) return;

  await compensation.notifyDispatchPartialFailure({
    companyId: params.input.companyId,
    mainRoomId: params.input.roomId,
    threadId: params.input.threadId ?? null,
    ceoAgentId: ceoId,
    planMessageId: params.planMessageId ?? params.input.messageId ?? null,
    parentGoalTaskId: params.parentGoalTaskId,
    skipped,
    slugToLabel: buildMainRoomDispatchSlugToLabelMap(params.roomContext),
    retried: true,
  });
}
