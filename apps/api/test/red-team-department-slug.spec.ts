import { ForbiddenException } from '@nestjs/common';
import { DepartmentSlugGuard } from '@service/tenant';

describe('Red team: department slug policy', () => {
  const guard = new DepartmentSlugGuard();

  function ctx(slug: string | undefined, from: 'params' | 'body' = 'params') {
    return {
      switchToHttp: () => ({
        getRequest: () =>
          from === 'params' ? { params: { departmentSlug: slug } } : { body: { departmentSlug: slug } },
      }),
    } as any;
  }

  it('rejects path traversal in departmentSlug', () => {
    expect(() => guard.canActivate(ctx('..%2fetc', 'params'))).toThrow(ForbiddenException);
  });

  it('rejects slash in slug', () => {
    expect(() => guard.canActivate(ctx('foo/bar'))).toThrow(ForbiddenException);
  });

  it('allows canonical platform slugs', () => {
    expect(guard.canActivate(ctx('paid-media'))).toBe(true);
    expect(guard.canActivate(ctx('spatial-computing'))).toBe(true);
  });
});
