/**
 * Legacy 路由标签：`direct_summon` 曾用于 post-intent 直连语义。
 * 主群 Intent 层固定 `audience_resolution`；是否直连看 `routingHints.explicitDirectTargets` / `targetAgentIds`。
 */

export function isDirectSummonCanonicalIntent(intentType: string | null | undefined): boolean {
  const t = String(intentType ?? '').trim();
  return t === 'direct_summon' || t === 'direct_agent' || t === 'direct_group';
}
