import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { UserInfo } from '../types/user.types.js';

type UserContextRequest = Request & { user?: UserInfo };

@Injectable()
export class UserContextMiddleware implements NestMiddleware {
  use(req: UserContextRequest, _res: Response, next: NextFunction) {
    const encoded = req.headers['x-user-info'] as string | undefined;
    if (!encoded) return next();

    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.id === 'string') {
        req.user = {
          id: parsed.id,
          username:
            typeof parsed.username === 'string'
              ? parsed.username
              : parsed.email || parsed.id,
          email: typeof parsed.email === 'string' ? parsed.email : undefined,
          roles: Array.isArray(parsed.roles) ? parsed.roles : undefined,
          permissions: Array.isArray(parsed.permissions)
            ? parsed.permissions
            : undefined,
        };
      }
    } catch {
      // ignore malformed header
    }
    next();
  }
}

