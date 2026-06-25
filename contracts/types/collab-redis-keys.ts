import { createHash } from 'node:crypto';
import { normalizeCollaborationThreadId } from './collab-thread-id.js';

function threadSegment(threadId: string): string {
  return normalizeCollaborationThreadId(threadId);
}

function keyPrefixSegment(keyPrefix: string): string {
  const p = keyPrefix.trim();
  return p ? `${p}:` : '';
}

/** 主群：上一轮 quick 引导规划后，下一轮 Intent 一次性提示（planning continuity） */
export function planningContinuityHintKey(
  keyPrefix: string,
  companyId: string,
  roomId: string,
  threadId: string,
): string {
  const tid = threadSegment(threadId);
  return `${keyPrefixSegment(keyPrefix)}collab:planning_continuity_hint:v1:${companyId}:${roomId}:${tid}`;
}

/** 主群：CEO Replay 统一回合状态（draft + alignment sections）。 */
export function mainRoomCeoTurnStateKey(
  keyPrefix: string,
  companyId: string,
  roomId: string,
  threadId: string,
): string {
  const tid = threadSegment(threadId);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_ceo_turn_state:v1:${companyId}:${roomId}:${tid}`;
}

/** 主群：与 CEO replay 往复对齐后的战略目标摘要（供 Strategy 注入，非卡片编辑流）。 */
export function mainRoomStrategyDraftSessionKey(
  keyPrefix: string,
  companyId: string,
  roomId: string,
  threadId: string,
): string {
  const tid = threadSegment(threadId);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_strategy_draft:v1:${companyId}:${roomId}:${tid}`;
}

/** 主群：CEO Replay 对齐状态机（待确认 / 已授权）。 */
export function mainRoomCeoAlignmentSessionKey(
  keyPrefix: string,
  companyId: string,
  roomId: string,
  threadId: string,
): string {
  const tid = threadSegment(threadId);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_ceo_alignment:v1:${companyId}:${roomId}:${tid}`;
}

/** 主群：CEO Dispatch Plan（Markdown SSOT）会话。 */
export function mainRoomDispatchPlanSessionKey(
  keyPrefix: string,
  companyId: string,
  roomId: string,
  threadId: string,
): string {
  const tid = threadSegment(threadId);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_dispatch_plan:v1:${companyId}:${roomId}:${tid}`;
}

/** 主群：Strategy 产出的目标草稿；定稿前不跑编排。 */
export function mainRoomStrategyGoalSessionKey(
  keyPrefix: string,
  companyId: string,
  roomId: string,
  threadId: string,
): string {
  const tid = threadSegment(threadId);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_strategy_goal:v1:${companyId}:${roomId}:${tid}`;
}

/** 主群：部门派发 CEO 气泡消息幂等（按 delegationKey 哈希）。 */
export function mainRoomDeptDispatchMessageDedupeKey(
  keyPrefix: string,
  companyId: string,
  delegationKey: string,
): string {
  const h = createHash('sha256').update(String(delegationKey ?? '').trim()).digest('hex').slice(0, 40);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_dept_dispatch_msg:v1:${companyId}:${h}`;
}

/** 主群：依赖型部门派发队列（挂主目标 task id）。 */
export function mainRoomDistributionAssignQueueKey(keyPrefix: string, parentGoalTaskId: string): string {
  const pid = String(parentGoalTaskId ?? '').trim();
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_dist_queue:v1:${pid}`;
}

/** 主群：编排子目标全部完成后的总结气泡幂等。 */
export function mainRoomDistributionCompletionSummaryDedupeKey(
  keyPrefix: string,
  companyId: string,
  parentGoalTaskId: string,
  distributionId: string,
): string {
  const h = createHash('sha256')
    .update(`${companyId}:${parentGoalTaskId}:${distributionId}`)
    .digest('hex')
    .slice(0, 40);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_dist_done_summary:v1:${h}`;
}

/** 主群：依赖队列解锁下一波部门任务时，Supervision 风格推进提示幂等（按刚完成的子任务 id）。 */
export function mainRoomWaveSupervisionNudgeDedupeKey(
  keyPrefix: string,
  companyId: string,
  parentGoalTaskId: string,
  triggerCompletedTaskId: string,
): string {
  const h = createHash('sha256')
    .update(`${companyId}:${parentGoalTaskId}:${triggerCompletedTaskId}`)
    .digest('hex')
    .slice(0, 40);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_wave_nudge:v1:${h}`;
}

/** 主群：老板暂停/撤回编排（阻断新派发与 deferred heavy）。 */
export function mainRoomOrchestrationPauseSessionKey(
  keyPrefix: string,
  companyId: string,
  roomId: string,
  threadId: string,
): string {
  const tid = threadSegment(threadId);
  return `${keyPrefixSegment(keyPrefix)}collab:main_room_orchestration_pause:v1:${companyId}:${roomId}:${tid}`;
}

/** Program timeline（Redis list，左入右出，保留最近 N 条）。 */
export function collaborationProgramTimelineKey(
  keyPrefix: string,
  companyId: string,
  programId: string,
): string {
  const pid = String(programId ?? '').trim();
  return `${keyPrefixSegment(keyPrefix)}collab:program_timeline:v1:${companyId}:${pid}`;
}
