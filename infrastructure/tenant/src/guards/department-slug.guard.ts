import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { assertValidDepartmentSlug } from '../utils/department-slug-validation.js';

/**
 * 校验 `departmentSlug` 路径/body/query 参数：防路径穿越与非法字符。
 * 与平台 `platform_departments.slug` 命名约定对齐（小写、数字、连字符）。
 */
@Injectable()
export class DepartmentSlugGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest() as {
      params?: Record<string, string>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    };
    const raw =
      (req.params?.departmentSlug as string | undefined) ??
      (req.body?.departmentSlug as string | undefined) ??
      (typeof req.query?.departmentSlug === 'string' ? req.query.departmentSlug : undefined);
    if (raw === undefined || raw === null || raw === '') {
      return true;
    }
    if (typeof raw !== 'string') {
      assertValidDepartmentSlug(String(raw));
      return true;
    }
    assertValidDepartmentSlug(raw);
    return true;
  }
}
