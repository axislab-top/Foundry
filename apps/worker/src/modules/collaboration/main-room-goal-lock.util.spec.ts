import { isFinalizeGoalLockMessage } from './main-room-goal-lock.util.js';

describe('isFinalizeGoalLockMessage', () => {
  it('matches finalize phrases', () => {
    expect(isFinalizeGoalLockMessage('定稿')).toBe(true);
    expect(isFinalizeGoalLockMessage('同意执行')).toBe(true);
    expect(isFinalizeGoalLockMessage('定稿并下发')).toBe(true);
    expect(isFinalizeGoalLockMessage('确认并开始部门编排')).toBe(true);
  });

  it('rejects unrelated text', () => {
    expect(isFinalizeGoalLockMessage('随便聊聊')).toBe(false);
    expect(isFinalizeGoalLockMessage('')).toBe(false);
  });

  it('matches short colloquial confirmations', () => {
    expect(isFinalizeGoalLockMessage('可以了')).toBe(true);
    expect(isFinalizeGoalLockMessage('开始吧')).toBe(true);
    expect(isFinalizeGoalLockMessage('就这样吧')).toBe(true);
    expect(isFinalizeGoalLockMessage('可以开始')).toBe(true);
  });
});
