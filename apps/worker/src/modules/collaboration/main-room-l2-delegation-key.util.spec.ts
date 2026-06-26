import { parseMainRoomL2GoalDelegationKey } from './main-room-l2-delegation-key.util.js';

describe('parseMainRoomL2GoalDelegationKey', () => {
  it('parses planId with internal colons', () => {
    const k = 'main_room_l2:trace-123:strategy:task-1:ops';
    expect(parseMainRoomL2GoalDelegationKey(k)).toEqual({
      planId: 'trace-123:strategy',
      planTaskId: 'task-1',
      deptSlug: 'ops',
    });
  });

  it('returns null for unrelated keys', () => {
    expect(parseMainRoomL2GoalDelegationKey('other:key')).toBeNull();
  });
});
