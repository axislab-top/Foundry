import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { UserInfo } from '../types/user.types.js';
import { TENANT_HEADER_COMPANY_ID } from '@service/tenant';

type UserContextRequest = Request & {
  user?: UserInfo;
  companyId?: string;
};

/**
 * 从 Gateway 注入的头部中解析用户信息，填充到 request.user
 */
@Injectable()
export class UserContextMiddleware implements NestMiddleware {
  use(req: UserContextRequest, _res: Response, next: NextFunction) {
    const companyIdHeader = req.headers[TENANT_HEADER_COMPANY_ID] as
      | string
      | undefined;
    if (typeof companyIdHeader === 'string' && companyIdHeader.trim()) {
      req.companyId = companyIdHeader.trim();
    }

    const encoded = req.headers['x-user-info'] as string | undefined;

    if (encoded) {
      try {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);

        // 最低要求：id 存在且为字符串
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
            companyId:
              req.companyId ||
              (typeof parsed.companyId === 'string' ? parsed.companyId : undefined),
            organizationNodeIds: Array.isArray(parsed.organizationNodeIds)
              ? parsed.organizationNodeIds.filter((x: unknown) => typeof x === 'string')
              : undefined,
          };
        }
      } catch {
        // 若解码/解析失败，不阻断请求，保持与网关设计的向前兼容
      }
    }

    next();
  }
}



























