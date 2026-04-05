import { ForbiddenException } from '@nestjs/common';
import { MemoryAccessService } from './memory-access.service.js';
import {
  companyNamespace,
  departmentNamespace,
  sessionNamespace,
} from '../utils/memory-namespace.js';

describe('MemoryAccessService', () => {
  const svc = new MemoryAccessService();

  it('restricts dept namespace for member without node id', () => {
    expect(() =>
      svc.resolveSearchNamespaces([departmentNamespace('n1')], {
        id: 'u1',
        roles: ['member'],
        organizationNodeIds: [],
      }),
    ).toThrow(ForbiddenException);
  });

  it('allows dept namespace when user belongs to node', () => {
    expect(
      svc.resolveSearchNamespaces([departmentNamespace('n1')], {
        id: 'u1',
        roles: ['member'],
        organizationNodeIds: ['n1'],
      }),
    ).toEqual([departmentNamespace('n1')]);
  });

  it('defaults to company (+ member depts) when namespaces omitted', () => {
    expect(
      svc.resolveSearchNamespaces(undefined, {
        id: 'u1',
        roles: ['member'],
        organizationNodeIds: ['d1'],
      }),
    ).toEqual([companyNamespace(), departmentNamespace('d1')]);
  });

  it('allows session namespace when room id is granted', () => {
    expect(
      svc.resolveSearchNamespaces([sessionNamespace('r1')], {
        id: 'u1',
        roles: ['member'],
        roomIds: ['r1'],
      }),
    ).toEqual([sessionNamespace('r1')]);
  });

  it('rejects session namespace without room access', () => {
    expect(() =>
      svc.resolveSearchNamespaces([sessionNamespace('r1')], {
        id: 'u1',
        roles: ['member'],
      }),
    ).toThrow(ForbiddenException);
  });
});
