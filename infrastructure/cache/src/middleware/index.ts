/**
 * 缓存中间件
 * 
 * 提供 Express/Koa 等框架的缓存中间件
 */

// 中间件实现可以根据需要添加
// 例如：Express 中间件、Koa 中间件等

export interface CacheMiddlewareOptions {
  ttl?: number;
  keyGenerator?: (req: any) => string;
  skipCache?: (req: any) => boolean;
  adapterType?: import('../types').CacheAdapterType;
}

// 这里可以添加具体的中间件实现
// 例如：createExpressCacheMiddleware, createKoaCacheMiddleware 等












































