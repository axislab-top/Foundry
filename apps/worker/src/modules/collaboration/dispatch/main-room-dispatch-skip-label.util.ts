import type { MainRoomDispatchSkipReason } from '../main-room-dispatch-skip.types.js';

const REASON_LABEL: Record<MainRoomDispatchSkipReason, string> = {
  no_room: '未配置部门群',
  no_director: '未绑定部门主管',
  non_dispatchable: '部门不可指派',
  no_org_node: '组织树无此部门',
  rpc_failed: '派发 RPC 失败',
  assign_failed: '创建子目标失败',
  dept_room_card_failed: '部门群任务卡片失败',
};

export function mainRoomDispatchSkipReasonLabel(reason: string): string {
  const key = String(reason ?? '').trim() as MainRoomDispatchSkipReason;
  return REASON_LABEL[key] ?? reason;
}

export function buildMainRoomDispatchSkippedNoticeLines(
  skipped: Array<{ departmentSlug: string; reason: string }>,
  slugToLabel?: Map<string, string> | Record<string, string>,
): string[] {
  const labelMap =
    slugToLabel instanceof Map
      ? slugToLabel
      : new Map(Object.entries(slugToLabel ?? {}));
  return skipped.slice(0, 8).map((row) => {
    const slug = String(row.departmentSlug ?? '').trim().toLowerCase();
    const label = labelMap.get(slug) ?? slug;
    const reasonLabel = mainRoomDispatchSkipReasonLabel(String(row.reason ?? '').trim());
    return `· ${label}：${reasonLabel}`;
  });
}
