import { MarketplaceMemberAssignmentService } from './marketplace-member-assignment.service.js';
import type { PlatformDepartmentWithDirector } from './platform-department-catalog.service.js';

describe('MarketplaceMemberAssignmentService', () => {
  const service = new MarketplaceMemberAssignmentService({} as any);

  const marketingDept: PlatformDepartmentWithDirector = {
    slug: 'marketing',
    displayName: '营销部',
    headAgentSlug: 'marketing-head',
    headAgentName: '营销总监',
    sortOrder: 1,
    isDefaultForNewCompany: true,
    category: null,
    responsibilitySummary: null,
    taskTypeTags: [],
  };

  it('matches employee by department slug in department_roles', () => {
    const agent = {
      slug: 'content-writer',
      departmentRoles: ['marketing', '营销部'],
    } as any;
    expect(service.employeeMatchesDepartment(agent, marketingDept)).toBe(true);
  });

  it('fills missing members from department pool', () => {
    const pool = new Map([['marketing', ['writer-a', 'writer-b']]]);
    const out = service.fillMissingMembers(
      [
        {
          name: '营销部',
          headAgentSlug: 'marketing-head',
          memberAgentSlugs: [],
          platformDepartmentSlug: 'marketing',
        },
      ],
      pool,
      'medium',
    );
    expect(out[0]?.memberAgentSlugs).toEqual(['writer-a', 'writer-b']);
  });
});
