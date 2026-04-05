import { BadRequestException } from '@nestjs/common';
import { companyNamespace } from '../utils/memory-namespace.js';
import { MemoryQueryRouterService } from './memory-query-router.service.js';

describe('MemoryQueryRouterService', () => {
  const router = new MemoryQueryRouterService();

  const base = {
    companyId: 'c1',
    actor: { id: 'u1' },
  };

  it('scope=company pins company namespace only', () => {
    const plan = router.plan({
      scope: 'company',
      baseFilters: { ...base, roomId: 'r1', agentId: 'a1' },
    });
    expect(plan.useHierarchy).toBe(false);
    expect(plan.filters.namespaces).toEqual([companyNamespace()]);
    expect(plan.filters.roomId).toBeUndefined();
    expect(plan.filters.agentId).toBeUndefined();
  });

  it('scope=personal requires agentId', () => {
    expect(() =>
      router.plan({ scope: 'personal', baseFilters: base }),
    ).toThrow(BadRequestException);
  });

  it('scope=department requires primaryOrganizationNodeId', () => {
    expect(() =>
      router.plan({ scope: 'department', baseFilters: base }),
    ).toThrow(BadRequestException);
  });

  it('director default scope is department', () => {
    const plan = router.plan({
      agentRole: 'director',
      primaryOrganizationNodeId: 'n1',
      baseFilters: base,
    });
    expect(plan.scope).toBe('department');
    expect(plan.filters.organizationNodeId).toBe('n1');
  });

  it('ceo default uses hierarchy', () => {
    const plan = router.plan({
      agentRole: 'ceo',
      baseFilters: base,
    });
    expect(plan.useHierarchy).toBe(true);
    expect(plan.scope).toBe('hierarchy');
  });
});
