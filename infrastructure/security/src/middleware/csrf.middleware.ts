/**
 * CSRF 保护中间件（Express）
 */

import { CsrfService } from '../services/csrf.service.js';
import type { CsrfConfig } from '../config/security-config.js';

export function csrfMiddleware(config: CsrfConfig) {
  const csrfService = new CsrfService(config);
  const cookieName = config.cookieName || '_csrf';
  const headerName = config.headerName || 'x-csrf-token';

  return (req: any, res: any, next: any) => {
    // 跳过 GET、HEAD、OPTIONS 请求
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // 从 cookie 获取令牌（需要 cookie-parser 中间件）
    const cookies = (req as any).cookies || {};
    const cookieToken = cookies[cookieName];
    // 从 header 获取令牌
    const headerToken = req.headers?.[headerName.toLowerCase()] as string;

    if (!cookieToken || !headerToken) {
      return res.status(403).json({ error: 'CSRF token missing' });
    }

    if (cookieToken !== headerToken || !csrfService.verifyToken(headerToken)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
  };
}

