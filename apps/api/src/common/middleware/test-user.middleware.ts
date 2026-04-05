import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * 测试环境专用：从自定义 Header 注入 req.user，绕过 Gateway 缺失的问题。
 * 仅在 TEST_AUTH_ENABLED=true 时由 AppModule 注册。
 */
@Injectable()
export class TestUserMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TestUserMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // 如果已有用户信息（例如未来接入 Gateway），不覆盖
    if ((req as any).user) {
      return next();
    }

    const header = req.headers['x-test-user'];
    const headerId = req.headers['x-user-id'];
    const headerEmail = req.headers['x-user-email'];
    const headerRoles = req.headers['x-user-roles'];

    let user: any | undefined;

    // 优先使用 x-test-user JSON
    if (header && typeof header === 'string') {
      try {
        user = JSON.parse(header);
      } catch (err: any) {
        this.logger.warn('无法解析 x-test-user Header，需为 JSON 字符串', {
          error: err?.message,
        });
      }
    }

    // 兜底使用分散 Header
    if (!user && (headerId || headerEmail)) {
      user = {
        id: headerId || 'test-user-id',
        email: headerEmail || 'test@example.com',
        username: headerEmail || 'test-user',
        roles: this.parseRoles(headerRoles),
        permissions: [],
      };
    }

    // 默认管理员（便于跑全量用例）
    if (!user) {
      user = {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'right123@admin.local',
        username: 'right123',
        roles: ['admin'],
        permissions: [],
      };
    }

    (req as any).user = user;
    next();
  }

  private parseRoles(headerRoles: string | string[] | undefined): string[] {
    if (!headerRoles) return [];
    if (Array.isArray(headerRoles)) return headerRoles;
    // 允许逗号分隔
    return headerRoles
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }
}


























