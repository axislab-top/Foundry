/**
 * Replay 组装的 transcript 块若为「不可用说明」而非真实节选，则不应写入 `transcriptSnapshotForTurn`，
 * 以便 L1 回落 `collaboration.messages.list`。
 */
export function shouldSkipTranscriptSnapshotReuse(transcriptBlock: string): boolean {
  const t = String(transcriptBlock ?? '').trim();
  if (!t) return true;
  if (/CEO_REPLAY_INJECT_RECENT_TRANSCRIPT/.test(t)) return true;
  if (/collaboration\.messages\.list 拉取失败/.test(t)) return true;
  if (/环境已关闭 .*CEO_REPLAY_INJECT_RECENT_TRANSCRIPT/.test(t)) return true;
  return false;
}
