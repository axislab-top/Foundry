/**
 * 解析 `tasks.goals.assignToDepartmentDirector` 使用的 goalDelegationKey：
 * `main_room_l2:${planId}:${planTaskId}:${deptSlug}`，其中 planId 可含冒号（如 `${traceId}:strategy`）。
 */
export function parseMainRoomL2GoalDelegationKey(raw: string): {
  planId: string;
  planTaskId: string;
  deptSlug: string;
} | null {
  const s = String(raw ?? '').trim();
  if (!s.startsWith('main_room_l2:')) return null;
  const rest = s.slice('main_room_l2:'.length);
  const parts = rest.split(':');
  if (parts.length < 3) return null;
  const deptSlug = String(parts[parts.length - 1] ?? '')
    .trim()
    .toLowerCase();
  const planTaskId = String(parts[parts.length - 2] ?? '').trim();
  const planId = parts.slice(0, -2).join(':').trim();
  if (!planId || !planTaskId || !deptSlug) return null;
  return { planId, planTaskId, deptSlug };
}
