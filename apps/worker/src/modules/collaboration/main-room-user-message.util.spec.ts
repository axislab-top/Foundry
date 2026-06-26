import {
  assistantReplySuggestsPlanningHandoff,
  userMessageIsPureCasual,
  userMessageSuggestsPlanningContinuity,
} from './main-room-user-message.util.js';

describe('userMessageSuggestsPlanningContinuity', () => {
  it('detects planning-related follow-ups', () => {
    expect(userMessageSuggestsPlanningContinuity('嗯，另外下季度目标怎么定')).toBe(true);
    expect(userMessageSuggestsPlanningContinuity('你在吗')).toBe(false);
  });
});

describe('assistantReplySuggestsPlanningHandoff', () => {
  it('requires topic and invite signals', () => {
    expect(
      assistantReplySuggestsPlanningHandoff(
        '关于下季度 OKR，可以拆成三条主线；要不要我帮你一起细化里程碑与负责人？',
      ),
    ).toBe(true);
    expect(assistantReplySuggestsPlanningHandoff('收到')).toBe(false);
  });
});

describe('userMessageIsPureCasual', () => {
  it('matches short greetings', () => {
    expect(userMessageIsPureCasual('收到')).toBe(true);
    expect(userMessageIsPureCasual('你在吗')).toBe(true);
    expect(userMessageIsPureCasual('再见')).toBe(true);
    expect(userMessageIsPureCasual('下季度目标怎么定')).toBe(false);
  });
});
