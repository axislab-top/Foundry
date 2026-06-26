/**
 * Phase 14：routePath 可观测别名（兼容旧字段 6 个月，日志 dual-write）。
 */
export function resolveObservabilityRoutePath(params: {
  routePath: string;
  inlineReplyHandled?: boolean;
  deferHeavy?: boolean;
}): { routePath: string; routePathAlias: string | null } {
  const route = String(params.routePath ?? '').trim() || 'unknown';
  const inline = params.inlineReplyHandled === true;
  const deferHeavy = params.deferHeavy === true;

  if (route === 'orchestration' && inline && !deferHeavy) {
    return { routePath: route, routePathAlias: 'ceo_inline_reply' };
  }
  if (route === 'direct_agent' || route === 'direct_group') {
    return { routePath: route, routePathAlias: 'ceo_light_reply' };
  }
  if (route === 'dispatch_plan_flush' && deferHeavy) {
    return { routePath: route, routePathAlias: 'dispatch_plan_deferred' };
  }
  return { routePath: route, routePathAlias: null };
}
