import { DepartmentHeadResolverService } from './department-head-resolver.service.js';

describe('DepartmentHeadResolverService', () => {
  it('returns requested slug when it is a published department head', async () => {
    const repo = {
      findOne: jest.fn(async () => ({ slug: 'marketing-director' })),
      createQueryBuilder: jest.fn(),
    };
    const svc = new DepartmentHeadResolverService(repo as any);

    await expect(
      svc.resolveHeadSlug({ departmentName: '市场部', requestedSlug: 'marketing-director' }),
    ).resolves.toBe('marketing-director');
  });

  it('throws when requested slug is not a published department head', async () => {
    const repo = {
      findOne: jest.fn(async () => null),
      createQueryBuilder: jest.fn(),
    };
    const svc = new DepartmentHeadResolverService(repo as any);

    await expect(
      svc.resolveHeadSlug({ departmentName: '市场部', requestedSlug: 'some-slug' }),
    ).rejects.toThrow('部门「市场部」指定的主管 Agent 未上架或未标记为部门主管');
  });

  it('resolves by departmentRoles overlap when no requested slug', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ slug: 'ops-director' })),
    };
    const repo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    const svc = new DepartmentHeadResolverService(repo as any);

    await expect(svc.resolveHeadSlug({ departmentName: '运营部' })).resolves.toBe('ops-director');
    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('throws when no marketplace head matches department', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => undefined),
    };
    const repo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    const svc = new DepartmentHeadResolverService(repo as any);

    await expect(svc.resolveHeadSlug({ departmentName: '不存在的部门' })).rejects.toThrow(
      '无可用主管 Agent',
    );
  });

  it('matches marketplace department_roles when departmentName is English', async () => {
    const capturedRoles: string[] = [];
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn((sql: string, params: any) => {
        if (String(sql).includes('department_roles') && params?.roles) {
          if (Array.isArray(params.roles)) capturedRoles.push(...params.roles);
        }
        return qb as any;
      }),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ slug: 'eng-director' })),
    };

    const repo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    const svc = new DepartmentHeadResolverService(repo as any);

    await expect(svc.resolveHeadSlug({ departmentName: 'Engineering' })).resolves.toBe('eng-director');

    // 根因修复：无论传入英文部门名还是中文部门名，都应生成可匹配的 token 集合。
    expect(capturedRoles).toEqual(expect.arrayContaining(['Engineering', 'engineering']));
    // English -> Chinese mapping token should also be included.
    expect(capturedRoles).toEqual(expect.arrayContaining(['工程部']));
  });
});

