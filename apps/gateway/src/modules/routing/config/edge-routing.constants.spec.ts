import { ROUTES, findRoute } from './routes.config.js';
import {
  AUTH_RPC_PATTERNS,
  isLegacyAuthHttpProxyRoute,
  LEGACY_AUTH_HTTP_PROXY_PATH,
  PROXY_HTTP_MOUNT_PATTERNS,
} from './edge-routing.constants.js';

describe('edge-routing.constants', () => {
  it('does not proxy /auth/* over HTTP to API', () => {
    expect(PROXY_HTTP_MOUNT_PATTERNS).not.toContain('/auth/*');
    const httpAuthProxy = ROUTES.find(
      (r) =>
        r.path === LEGACY_AUTH_HTTP_PROXY_PATH &&
        r.transport === 'http' &&
        r.service === 'api',
    );
    expect(httpAuthProxy).toBeUndefined();
  });

  it('keeps auth.validate as internal RPC only', () => {
    const validateRoute = findRoute('/auth/validate', 'POST');
    expect(validateRoute?.route.transport).toBe('rpc');
    expect(validateRoute?.route.rpcPattern).toBe('auth.validate');
    expect(AUTH_RPC_PATTERNS).toContain('auth.validate');
  });

  it('identifies legacy DB auth HTTP proxy rows', () => {
    expect(
      isLegacyAuthHttpProxyRoute({
        path: '/auth/*',
        transport: 'http',
        service: 'api',
      }),
    ).toBe(true);
    expect(
      isLegacyAuthHttpProxyRoute({
        path: '/auth/validate',
        transport: 'rpc',
        service: 'api',
      }),
    ).toBe(false);
  });
});
