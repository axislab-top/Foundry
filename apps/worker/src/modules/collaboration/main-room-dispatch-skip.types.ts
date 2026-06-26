/** 主群派发 flush 时跳过部门的机器可读原因 */
export type MainRoomDispatchSkipReason =
  | 'no_room'
  | 'no_director'
  | 'non_dispatchable'
  | 'no_org_node'
  | 'rpc_failed'
  | 'assign_failed'
  | 'dept_room_card_failed';

export type MainRoomDispatchSkipRow = {
  departmentSlug: string;
  reason: MainRoomDispatchSkipReason;
  planTaskId?: string;
};

export type MainRoomDispatchFlushResult = {
  skipped: MainRoomDispatchSkipRow[];
  assignedCount: number;
};
