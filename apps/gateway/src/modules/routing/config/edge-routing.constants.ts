/**
 * Gateway 边缘路由分层（单一事实来源）
 *
 * 1. **Gateway-native HTTP** — 由 Nest 控制器直接处理，不经 ProxyController / RoutingService。
 *    典型：`AuthController`（JWT 签发/刷新/登出）、health、admin 控制台等。
 *
 * 2. **Downstream HTTP proxy** — 仅转发业务面 API（v1 / webhooks / worker）。
 *
 * 3. **Internal RPC** — Gateway → API 微服务（如 `auth.validate`），不对浏览器暴露重复 HTTP 面。
 *
 * 反模式（已废弃）：将 `/auth/*` 配成 HTTP 代理到 API。
 * API 只提供凭证校验与用户回源（`/api/auth/validate` RPC、`GET /api/auth/users/:id`），
 * 不在 API 上重复暴露 login/refresh HTTP。
 */

/** ProxyController 挂载的下游 HTTP 前缀（勿包含 /auth） */
export const PROXY_HTTP_MOUNT_PATTERNS = [
  '/v1/*',
  '/webhooks/*',
  '/worker/*',
] as const;

/** 历史遗留：曾写入 DB 的 auth HTTP 代理路由，启动时退役 */
export const LEGACY_AUTH_HTTP_PROXY_PATH = '/auth/*';

/** 仍保留的 auth 相关 RPC（内网契约，非浏览器 HTTP 代理） */
export const AUTH_RPC_PATTERNS = ['auth.validate'] as const;

export function isLegacyAuthHttpProxyRoute(route: {
  path: string;
  transport?: string;
  service?: string;
}): boolean {
  return (
    route.path === LEGACY_AUTH_HTTP_PROXY_PATH &&
    (route.transport ?? 'http') === 'http' &&
    route.service === 'api'
  );
}
