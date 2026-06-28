/**
 * 路由接口
 */
export interface Route {
  path: string; // 路由路径（支持通配符）
  service: string; // 服务名称
  target?: string; // 目标服务地址（静态路由使用）
  rewritePath?: string; // 路径重写规则（动态路由使用）
  methods?: string[]; // 允许的 HTTP 方法
  authRequired?: boolean; // 是否需要认证
  timeout?: number; // 超时时间（毫秒）
  transport?: 'http' | 'rpc'; // 传输方式（默认 http）
  rpcClientName?: 'api' | 'webhooks'; // rpc client 名称
  rpcPattern?: string; // rpc message pattern
  rpcTimeoutMs?: number; // rpc 超时（毫秒）
  /** HTTP 代理专用：axios responseType，下载/二进制端点使用 'arraybuffer' */
  proxyResponseType?: 'json' | 'arraybuffer' | 'blob' | 'text' | 'stream';
}

/**
 * 代理选项接口
 */
export interface ProxyOptions {
  target: string; // 目标服务地址
  timeout?: number; // 超时时间
  headers?: Record<string, string>; // 额外请求头
  rewrite?: (path: string) => string; // 路径重写函数
  /** axios responseType，下载/二进制端点使用 'arraybuffer' */
  responseType?: 'json' | 'arraybuffer' | 'blob' | 'text' | 'stream';
}





























