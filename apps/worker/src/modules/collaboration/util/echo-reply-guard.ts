/**
 * 检测模型回复是否在复述用户输入（与 orchestration 终拍逻辑对齐）。
 */

function normalizeForEchoCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？,.!?：:；;、“”"'`【】\[\]（）()]/g, '')
    .trim();
}

export function isLikelyEchoReply(userText: string, replyText: string): boolean {
  const u = normalizeForEchoCheck(userText);
  const r = normalizeForEchoCheck(replyText);
  if (!u || !r) return false;
  if (u === r) return true;
  if (u.length >= 6 && (r.includes(u) || u.includes(r))) return true;
  const minLen = Math.min(u.length, r.length);
  if (minLen >= 10) {
    const overlap = [...u].filter((ch) => r.includes(ch)).length / Math.max(u.length, 1);
    if (overlap > 0.92) return true;
  }
  return false;
}
