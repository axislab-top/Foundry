import type { NextFunction, Request, Response } from 'express';
import { assertValidDepartmentSlug } from '@service/tenant';

const PREFIXES = ['/v1/memory', '/v1/files', '/v1/file-assets', '/worker'];

function pathMatchesProxy(path: string): boolean {
  const p = path.replace(/\/+$/, '') || '/';
  return PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

function readDepartmentSlug(req: Request): string | undefined {
  const q = req.query?.departmentSlug;
  if (typeof q === 'string' && q.trim()) return q.trim();
  const b = (req.body as Record<string, unknown> | undefined)?.departmentSlug;
  if (typeof b === 'string' && b.trim()) return b.trim();
  const params = (req.params as Record<string, string> | undefined)?.departmentSlug;
  if (typeof params === 'string' && params.trim()) return params.trim();
  const ns = (req.body as Record<string, unknown> | undefined)?.namespace;
  if (typeof ns === 'string' && ns.startsWith('department:')) {
    return ns.slice('department:'.length).trim();
  }
  return undefined;
}

/**
 * P11.3：在网关代理层校验 `departmentSlug`（query/body），防止非法 slug 到达 API/Worker/Runner。
 */
export function departmentSlugMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    let path = req.path || req.url?.split('?')[0] || '/';
    if (path.startsWith('/api/')) {
      path = path.slice(4);
    } else if (path === '/api') {
      path = '/';
    }
    if (path.length > 1) {
      path = path.replace(/\/+$/, '');
    }
    if (!pathMatchesProxy(path)) {
      next();
      return;
    }
    const slug = readDepartmentSlug(req);
    if (slug != null && slug !== '') {
      assertValidDepartmentSlug(slug);
    }
    next();
  } catch (e) {
    next(e);
  }
}
