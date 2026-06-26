import type { CollaborationDeliverableArtifactRow } from '../utils/employee-deliverable-artifacts.util.js';

/** 合并员工子任务交付物到 L2 父任务 metadata（供主群结案摘要读取）。 */
export function mergeDeliverableArtifactsForL2Parent(
  existing: CollaborationDeliverableArtifactRow[] | undefined,
  incoming: CollaborationDeliverableArtifactRow[],
): CollaborationDeliverableArtifactRow[] {
  const base = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(
    base.map((a) => String(a.fileAssetId ?? a.uri ?? a.content ?? '').trim()).filter(Boolean),
  );
  for (const row of incoming) {
    const key = String(row.fileAssetId ?? row.uri ?? row.content ?? '').trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    base.push(row);
  }
  return base.slice(0, 24);
}

export function isMainRoomL2GoalDelegationKey(goalDelegationKey: string | undefined | null): boolean {
  return String(goalDelegationKey ?? '').trim().startsWith('main_room_l2:');
}
