import { resolveObservabilityRoutePath } from './route-path-observability.util.js';

describe('route-path-observability.util', () => {
  it('aliases orchestration inline reply', () => {
    const out = resolveObservabilityRoutePath({
      routePath: 'orchestration',
      inlineReplyHandled: true,
      deferHeavy: false,
    });
    expect(out.routePathAlias).toBe('ceo_inline_reply');
  });

  it('aliases deferred dispatch flush', () => {
    const out = resolveObservabilityRoutePath({
      routePath: 'dispatch_plan_flush',
      deferHeavy: true,
    });
    expect(out.routePathAlias).toBe('dispatch_plan_deferred');
  });
});
