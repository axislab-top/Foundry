import {
  REPLAY_UNTRUSTED_MEMORY_BANNER,
  REPLAY_UNTRUSTED_TRANSCRIPT_BANNER,
  formatReplayDelegateMessageCategoryLine,
  wrapReplayUntrustedMemoryBlock,
  wrapReplayUntrustedTranscriptBlock,
} from './main-room-replay-trust-boundary.util.js';

describe('main-room-replay-trust-boundary.util', () => {
  it('wraps transcript with banner once', () => {
    const inner = '【最近对话 — 节选】\n- human: hi';
    const once = wrapReplayUntrustedTranscriptBlock(inner);
    expect(once.startsWith(REPLAY_UNTRUSTED_TRANSCRIPT_BANNER)).toBe(true);
    expect(once).toContain('human: hi');
    expect(wrapReplayUntrustedTranscriptBlock(once)).toBe(once);
  });

  it('wraps memory with banner once', () => {
    const inner = '【会话相关知识检索】\n- item';
    const once = wrapReplayUntrustedMemoryBlock(inner);
    expect(once.startsWith(REPLAY_UNTRUSTED_MEMORY_BANNER)).toBe(true);
    expect(wrapReplayUntrustedMemoryBlock(once)).toBe(once);
  });

  it('returns empty for blank input', () => {
    expect(wrapReplayUntrustedTranscriptBlock('')).toBe('');
    expect(wrapReplayUntrustedMemoryBlock('   ')).toBe('');
  });

  it('formats messageCategory with guidance', () => {
    expect(formatReplayDelegateMessageCategoryLine(null)).toContain('none');
    expect(formatReplayDelegateMessageCategoryLine('task_publish')).toContain('task_publish');
  });
});
