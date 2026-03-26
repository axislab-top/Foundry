/**
 * 代理选项接口
 */
export interface ProxyOptions {
  target: string; // 目标服务地址
  timeout?: number; // 超时时间（毫秒）
  headers?: Record<string, string>; // 额外请求头
  rewrite?: (path: string) => string; // 路径重写函数
}









































