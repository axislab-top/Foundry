/** P18：Warm Pool 健康度 — idle ≥ target×0.8 为 green，否则 yellow（≥0.5）或 red。 */

export type WarmPoolHealth = 'green' | 'yellow' | 'red' | 'na';

export function countWarmPoolIdleSlots(
  idleJobs: Array<{ phase: string | null }>,
): number {
  return idleJobs.filter((j) => {
    const p = (j.phase ?? '').trim().toLowerCase();
    if (p === 'failed') return false;
    return true;
  }).length;
}

export function computeWarmPoolHealth(params: {
  enabled: boolean;
  targetIdleJobs: number;
  currentIdle: number;
}): WarmPoolHealth {
  if (!params.enabled) {
    return 'na';
  }
  const target = params.targetIdleJobs;
  if (target <= 0) {
    return 'green';
  }
  const ratio = params.currentIdle / target;
  if (ratio >= 0.8) {
    return 'green';
  }
  if (ratio >= 0.5) {
    return 'yellow';
  }
  return 'red';
}
