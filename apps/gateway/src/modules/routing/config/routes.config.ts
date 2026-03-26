import { Route } from '../interfaces/route.interface.js';

/**
 * 路由配置
 */
export const ROUTES: Route[] = [
  // API 服务路由
  // 注意：Gateway 的全局前缀是 'api'，所以路径配置中不需要包含 '/api' 前缀
  // 请求 /api/v1/users 会被 NestJS 处理为 /v1/users（去掉全局前缀）
  // 关键链路：users.list / users.get 走 RPC（可灰度/可回滚）
  {
    path: '/v1/users',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'users.findAll',
    rpcTimeoutMs: 8000,
    methods: ['GET'],
  },
  {
    path: '/v1/users/:id',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'users.findOne',
    rpcTimeoutMs: 5000,
    methods: ['GET'],
  },
  // users 写接口：走 RPC（按 method 精确匹配）
  {
    path: '/v1/users',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'users.create',
    rpcTimeoutMs: 8000,
    methods: ['POST'],
  },
  {
    path: '/v1/users/:id',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'users.update',
    rpcTimeoutMs: 8000,
    methods: ['PATCH'],
  },
  {
    path: '/v1/users/:id',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'users.remove',
    rpcTimeoutMs: 8000,
    methods: ['DELETE'],
  },
  // oauth 控制面：走 RPC
  {
    path: '/v1/oauth/bind/:userId',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'oauth.bind',
    rpcTimeoutMs: 8000,
    methods: ['POST'],
  },
  {
    path: '/v1/oauth/accounts/:userId',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'oauth.accounts',
    rpcTimeoutMs: 5000,
    methods: ['GET'],
  },
  {
    path: '/v1/oauth/find-or-create',
    service: 'api',
    authRequired: false,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'oauth.findOrCreate',
    rpcTimeoutMs: 8000,
    methods: ['POST'],
  },
  // webhooks 管理面：走 RPC；接收端 /webhooks/* 保持 HTTP
  {
    path: '/v1/webhooks',
    service: 'webhooks',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'webhooks',
    rpcPattern: 'webhooks.findAll',
    rpcTimeoutMs: 8000,
    methods: ['GET'],
  },
  {
    path: '/v1/webhooks',
    service: 'webhooks',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'webhooks',
    rpcPattern: 'webhooks.create',
    rpcTimeoutMs: 8000,
    methods: ['POST'],
  },
  {
    path: '/v1/webhooks/:id',
    service: 'webhooks',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'webhooks',
    rpcPattern: 'webhooks.findOne',
    rpcTimeoutMs: 5000,
    methods: ['GET'],
  },
  {
    path: '/v1/webhooks/:id',
    service: 'webhooks',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'webhooks',
    rpcPattern: 'webhooks.update',
    rpcTimeoutMs: 8000,
    methods: ['PATCH'],
  },
  {
    path: '/v1/webhooks/:id',
    service: 'webhooks',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'webhooks',
    rpcPattern: 'webhooks.remove',
    rpcTimeoutMs: 8000,
    methods: ['DELETE'],
  },
  {
    path: '/v1/webhooks/:id/history',
    service: 'webhooks',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'webhooks',
    rpcPattern: 'webhooks.history',
    rpcTimeoutMs: 8000,
    methods: ['GET'],
  },
  // files：优先把非流式/控制面接口 RPC 化；上传/下载保持 HTTP（multipart/二进制更适合直连）
  {
    path: '/v1/files',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'files.list',
    rpcTimeoutMs: 8000,
    methods: ['GET'],
  },
  {
    path: '/v1/files/:path(*)/url',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'files.getUrl',
    rpcTimeoutMs: 5000,
    methods: ['GET'],
  },
  {
    path: '/v1/files/:path(*)/info',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'files.getInfo',
    rpcTimeoutMs: 5000,
    methods: ['GET'],
  },
  {
    path: '/v1/files/:path(*)',
    service: 'api',
    authRequired: true,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'files.delete',
    rpcTimeoutMs: 8000,
    methods: ['DELETE'],
  },
  {
    path: '/v1/*',
    service: 'api',
    target: '/api', // API Service 的全局前缀是 'api'，所以需要将 /v1/* 重写为 /api/*
    authRequired: true,
  },
  {
    path: '/auth/*',
    service: 'api',
    target: '/api/auth',
    authRequired: false,
    transport: 'http',
  },
  // 关键链路示例：用 RPC 走 auth.validate（可灰度/可回滚）
  {
    path: '/auth/validate',
    service: 'api',
    authRequired: false,
    transport: 'rpc',
    rpcClientName: 'api',
    rpcPattern: 'auth.validate',
    rpcTimeoutMs: 5000,
  },
  // Webhooks 服务路由
  {
    path: '/webhooks/*',
    service: 'webhooks',
    target: '/webhooks',
    authRequired: false, // Webhooks 接收端点，不需要认证
  },
  // Webhooks 管理API路由（通过Gateway转发）
  {
    path: '/v1/webhooks/*',
    service: 'webhooks',
    target: '/api/webhooks', // Webhooks Service的实际路径（全局前缀api + 控制器路径webhooks）
    authRequired: true, // Webhook管理API需要认证
  },
  // Worker 服务路由
  {
    path: '/worker/*',
    service: 'worker',
    target: '/worker',
    authRequired: true,
  },
];

/**
 * 根据路径查找路由
 */
function matchPattern(pattern: string, path: string): Record<string, string> | null {
  if (pattern === path) return {};
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 支持 :param(*) 形式（贪婪匹配，允许包含 /）
  const withGreedyParams = escaped.replace(
    /\\:([a-zA-Z0-9_]+)\\\(\\\*\\\)/g,
    (_m, p1) => `(?<${p1}>.*)`,
  );
  const withParams = withGreedyParams.replace(
    /\\:([a-zA-Z0-9_]+)/g,
    (_m, p1) => `(?<${p1}>[^/]+)`,
  );
  const withWildcard = withParams.replace(/\\\*/g, '(?<wildcard>.*)');
  const regex = new RegExp(`^${withWildcard}$`);
  const match = path.match(regex);
  if (!match) return null;
  return (match.groups || {}) as Record<string, string>;
}

export function findRoute(path: string): { route: Route; params: Record<string, string> } | undefined {
  for (const route of ROUTES) {
    const params = matchPattern(route.path, path);
    if (params) return { route, params };
  }
  return undefined;
}









































