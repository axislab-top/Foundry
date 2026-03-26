import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from '../../types/express.types.js';
import { csrfMiddleware } from '@service/security';

/**
 * CSRF 保护中间件
 * 防止跨站请求伪造攻击
 */
@Injectable()
export class CsrfProtectionMiddleware implements NestMiddleware {
  private middleware: (req: Request, res: Response, next: NextFunction) => void;

  constructor() {
    // 创建 CSRF 中间件
    this.middleware = csrfMiddleware({
      // 默认关闭，显式开启才启用，避免影响纯 API/JWT 调用
      enabled: process.env.CSRF_ENABLED === 'true',
      secret: process.env.CSRF_SECRET || process.env.JWT_SECRET || 'csrf-secret',
      cookieName: '_csrf',
      headerName: 'x-csrf-token',
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    // 如果 CSRF 未启用，直接通过
    if (process.env.CSRF_ENABLED !== 'true') {
      return next();
    }

    // 获取路径（处理全局前缀的情况）
    const path = req.path || req.url?.split('?')[0] || '';

    // 没有携带 CSRF header，则跳过（仅对前端表单/带 CSRF token 的请求生效）
    const csrfToken = req.headers['x-csrf-token'] as string | undefined;
    if (!csrfToken) {
      return next();
    }
    
    // 跳过健康检查和公开端点
    // 注意：需要同时支持带/不带全局前缀的路径
    const skipPaths = [
      '/api/health',
      '/health',
      '/metrics',
      '/api/auth/login',
      '/auth/login',
      '/api/auth/register',
      '/auth/register',
      '/api/auth/refresh',
      '/auth/refresh',
      '/api/auth/wechat/authorize',
      '/auth/wechat/authorize',
      '/api/auth/wechat/callback',
      '/auth/wechat/callback',
    ];

    const shouldSkip = skipPaths.some((skipPath) => {
      return (
        path === skipPath ||
        path.startsWith(skipPath + '/') ||
        path.toLowerCase() === skipPath.toLowerCase() ||
        path.toLowerCase().startsWith(skipPath.toLowerCase() + '/')
      );
    });

    if (shouldSkip) {
      return next();
    }

    this.middleware(req, res, next);
  }
}

