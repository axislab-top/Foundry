import { ForbiddenException } from '@nestjs/common';
import { MemoryAccessService } from './memory-access.service.js';
import {
  companyNamespace,
  departmentNamespaceLegacy,
  departmentNamespaceFromSlug,
  sessionNamespace,
} from '../utils/memory-namespace.js';

describe('MemoryAccessService', () => {
  function buildSvc(nodes: Array<{ id: string; metadata?: Record<string, unknown> }> = []) {
    const orgRepo: any = {
      findBy: jest.fn(async () => nodes),
    };
    const svc = new MemoryAccessService(orgRepo);
    return { svc, orgRepo };
  }

  it('restricts dept namespace for member without node id', async () => {
    const { svc } = buildSvc([]);
    await expect(
      svc.resolveSearchNamespaces([departmentNamespaceLegacy('n1')], {
        id: 'u1',
        roles: ['member'],
        organizationNodeIds: [],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows dept namespace when user belongs to node', async () => {
    const { svc } = buildSvc([{ id: 'n1', metadata: {} }]);
    await expect(
      svc.resolveSearchNamespaces([departmentNamespaceLegacy('n1')], {
        id: 'u1',
        roles: ['member'],
        organizationNodeIds: ['n1'],
      }),
    ).resolves.toEqual([departmentNamespaceLegacy('n1')]);
  });

  it('defaults to company (+ member depts) when namespaces omitted', async () => {
    const orgRepo: any = {
      findBy: jest.fn(async () => [{ id: 'd1', metadata: { platformDepartmentSlug: 'engineering' } }]),
    };
    const svc = new MemoryAccessService(orgRepo);
    const out = await svc.resolveSearchNamespaces(undefined, {
      id: 'u1',
      roles: ['member'],
      organizationNodeIds: ['d1'],
    });
    expect(out).toEqual(
      expect.arrayContaining([
        companyNamespace(),
        departmentNamespaceFromSlug('engineering'),
        departmentNamespaceLegacy('d1'),
      ]),
    );
    expect(out?.length).toBe(3);
  });

  it('allows session namespace when room id is granted', async () => {
    const { svc } = buildSvc([]);
    await expect(
      svc.resolveSearchNamespaces([sessionNamespace('r1')], {
        id: 'u1',
        roles: ['member'],
        roomIds: ['r1'],
      }),
    ).resolves.toEqual([sessionNamespace('r1')]);
  });

  it('rejects session namespace without room access', async () => {
    const { svc } = buildSvc([]);
    await expect(
      svc.resolveSearchNamespaces([sessionNamespace('r1')], {
        id: 'u1',
        roles: ['member'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
