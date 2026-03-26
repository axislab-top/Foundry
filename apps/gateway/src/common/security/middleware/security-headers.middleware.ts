import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from '../../types/express.types.js';
import { securityHeadersMiddleware } from '@service/security';

/**
 * 安全响应头中间件
 * 设置安全相关的 HTTP 响应头
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private middleware: (req: Request, res: Response, next: NextFunction) => void;

  constructor() {
    // 创建安全响应头中间件
    this.middleware = securityHeadersMiddleware({
      contentSecurityPolicy: "default-src 'self'",
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      xXssProtection: '1; mode=block',
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    this.middleware(req, res, next);
  }
}
















