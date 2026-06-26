import { shouldPreferProgramOrchestrationBeforeTurn } from './main-room-program-route.util.js';

describe('shouldPreferProgramOrchestrationBeforeTurn', () => {
  it('returns true for deliverable intent text', () => {
    expect(
      shouldPreferProgramOrchestrationBeforeTurn({
        contentText: '请各部门完成一份季度增长分析报告',
      }),
    ).toBe(true);
  });

  it('returns true for task_publish category', () => {
    expect(
      shouldPreferProgramOrchestrationBeforeTurn({
        contentText: '开始',
        messageCategory: 'task_publish',
      }),
    ).toBe(true);
  });

  it('returns true for confirm execution signals', () => {
    expect(
      shouldPreferProgramOrchestrationBeforeTurn({
        contentText: '确认执行',
        userConfirmedExecution: true,
      }),
    ).toBe(true);
  });

  it('returns false for casual chat in discussion mode', () => {
    expect(
      shouldPreferProgramOrchestrationBeforeTurn({
        contentText: '你好',
        collaborationMode: 'discussion',
      }),
    ).toBe(false);
  });
});
