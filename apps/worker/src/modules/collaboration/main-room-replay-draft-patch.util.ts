/**
 * 将 Replay 产出的自然语言 `draftGoalSummary` 规范为 `strategyGoal.patch` 载荷。
 * 不调用 LLM：从列表符号行抽取阶段性成果，否则退化为单条「对齐要点」。
 */

const MIN_SUMMARY_CHARS = 8;
const MAX_STRATEGY_GOAL = 8000;
const MAX_PHASE = 5;
const MAX_PHASE_TITLE = 120;
const MAX_PHASE_OUTCOME = 4000;

export type ReplayDraftStrategyPatchPayload = {
  strategyGoal: string;
  strategicPhases: Array<{ phaseId: string; title: string; outcome: string }>;
};

/**
 * @returns `null` 当摘要过短或去空格后为空（调用方应跳过 PATCH）
 */
export function buildStrategyPatchPayloadFromReplaySummary(raw: string): ReplayDraftStrategyPatchPayload | null {
  const trimmed = String(raw ?? '').trim();
  if (trimmed.length < MIN_SUMMARY_CHARS) return null;

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const bulletRe = /^[-*•]\s*(.+)$|^\d+[.)]\s*(.+)$/;

  const phaseLines: string[] = [];
  const nonBullet: string[] = [];
  for (const line of lines) {
    const m = line.match(bulletRe);
    const body = (m?.[1] ?? m?.[2] ?? '').trim();
    if (body) {
      phaseLines.push(body);
    } else {
      nonBullet.push(line);
    }
  }

  let strategyGoal = nonBullet.join('\n').trim() || trimmed;
  strategyGoal = strategyGoal.slice(0, MAX_STRATEGY_GOAL);

  let strategicPhases: Array<{ phaseId: string; title: string; outcome: string }> = [];
  if (phaseLines.length) {
    strategicPhases = phaseLines.slice(0, MAX_PHASE).map((line, idx) => {
      const colon = line.indexOf(':');
      const cnColon = line.indexOf('：');
      const sep = colon >= 0 && (cnColon < 0 || colon <= cnColon) ? colon : cnColon >= 0 ? cnColon : -1;
      if (sep > 0 && sep < line.length - 1) {
        const title = line.slice(0, sep).trim().slice(0, MAX_PHASE_TITLE) || `阶段 ${idx + 1}`;
        const outcome = line.slice(sep + 1).trim().slice(0, MAX_PHASE_OUTCOME);
        return { phaseId: `p${idx + 1}`, title, outcome: outcome || title };
      }
      const outcome = line.slice(0, MAX_PHASE_OUTCOME);
      return { phaseId: `p${idx + 1}`, title: `阶段 ${idx + 1}`, outcome: outcome || strategyGoal.slice(0, MAX_PHASE_OUTCOME) };
    });
  } else {
    strategicPhases = [{ phaseId: 'p1', title: 'Replay 对齐要点', outcome: trimmed.slice(0, MAX_PHASE_OUTCOME) }];
  }

  strategicPhases = strategicPhases.filter((ph) => ph.outcome.trim().length > 0);
  if (!strategicPhases.length) return null;

  return { strategyGoal, strategicPhases };
}
