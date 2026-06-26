import { getMainRoomReplayDelegateSystemPromptFullPrefetchSingleShot } from './main-room-replay-prompts.js';

describe('main-room-replay-prompts', () => {
  it('delegate prompt 使用提议语义而非 invoke 终裁', () => {
    const prompt = getMainRoomReplayDelegateSystemPromptFullPrefetchSingleShot();
    expect(prompt).toContain('提议');
    expect(prompt).toContain('Work Intent Compiler');
    expect(prompt).not.toContain('唯一**决定');
    expect(prompt).toContain('suggestExecutionUpgrade');
  });
});
