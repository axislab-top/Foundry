export type SkillExecutionOutcome = 'ok' | 'blocked' | 'failed';

/** 从 Skill 结构化返回中识别 blocked / failed（如 code-review-assistant）。 */
export function resolveSkillExecutionOutcome(result: unknown): SkillExecutionOutcome {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'ok';
  const status = String((result as Record<string, unknown>).status ?? '').trim().toLowerCase();
  if (status === 'blocked') return 'blocked';
  if (status === 'failed' || status === 'error') return 'failed';
  return 'ok';
}

/** artifact 正文是否为 Skill 返回的 blocked/failed JSON 壳，不能当作可验收交付物。 */
export function isBlockedSkillArtifactContent(content: string): boolean {
  const t = String(content ?? '').trim();
  if (!t.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>;
    const status = String(parsed.status ?? '').trim().toLowerCase();
    return status === 'blocked' || status === 'failed' || status === 'error';
  } catch {
    return false;
  }
}

/** Skill 因缺参返回的 JSON 占位（如 approvalReady:false / blockers），不可登记为可下载交付物。 */
export function isIncompleteSkillPlaceholderContent(content: string): boolean {
  const t = String(content ?? '').trim();
  if (!t.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>;
    if (parsed.approvalReady === false) return true;
    if (Array.isArray(parsed.blockers) && parsed.blockers.length > 0) return true;
    const title = String(parsed.memoTitle ?? parsed.title ?? '').trim();
    if (title.includes('待补充') || title.includes('占位')) return true;
    const summary = String(parsed.executiveSummary ?? parsed.summary ?? '').trim();
    if (summary.includes('无法形成') && summary.includes('缺少')) return true;
    return false;
  } catch {
    return false;
  }
}
