import { shouldSkipTranscriptSnapshotReuse } from './main-room-transcript-snapshot.util.js';

describe('shouldSkipTranscriptSnapshotReuse', () => {
  it('returns true for empty', () => {
    expect(shouldSkipTranscriptSnapshotReuse('')).toBe(true);
    expect(shouldSkipTranscriptSnapshotReuse('   ')).toBe(true);
  });

  it('returns false for normal excerpt', () => {
    expect(shouldSkipTranscriptSnapshotReuse('【最近对话 — 节选】\n1. [human] 你好')).toBe(false);
  });

  it('returns true when transcript feature disabled placeholder', () => {
    expect(
      shouldSkipTranscriptSnapshotReuse(
        '【最近对话 — 节选】（环境已关闭 CEO_REPLAY_INJECT_RECENT_TRANSCRIPT；不得假定存在未展示的多轮前文。）',
      ),
    ).toBe(true);
  });

  it('returns true when list fetch failed placeholder', () => {
    expect(
      shouldSkipTranscriptSnapshotReuse(
        '【最近对话 — 节选】（collaboration.messages.list 拉取失败；禁止编造前文；请仅依据记忆块与用户当前句说明无法可靠读取上文。）',
      ),
    ).toBe(true);
  });
});
