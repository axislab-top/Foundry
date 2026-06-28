import { ForbiddenException } from '@nestjs/common';

/**
 * 校验 HTTP 传入的部门 slug（路径穿越 / 非法字符）。
 * Gateway 中间件与 {@link DepartmentSlugGuard} 共用。
 */
export function assertValidDepartmentSlug(slug: string): void {
  const s = String(slug || '').trim();
  if (!s) {
    throw new ForbiddenException({ code: 'INVALID_DEPARTMENT_SLUG', message: '部门 slug 无效' });
  }
  if (s.includes('..') || s.includes('/') || s.includes('\\')) {
    throw new ForbiddenException({ code: 'DEPARTMENT_SLUG_TRAVERSAL', message: '禁止路径穿越' });
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) {
    throw new ForbiddenException({ code: 'INVALID_DEPARTMENT_SLUG', message: '部门 slug 格式不合法' });
  }
}
