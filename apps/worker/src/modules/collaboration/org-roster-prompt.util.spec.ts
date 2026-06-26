import { buildDepartmentRosterPromptBlock } from './org-roster-prompt.util.js';

describe('buildDepartmentRosterPromptBlock', () => {
  it('lists members when pack is present', () => {
    const block = buildDepartmentRosterPromptBlock({
      revision: 'r1',
      scope: 'department',
      anchor: {
        organizationNodeId: 'dept-1',
        departmentSlug: 'engineering',
        departmentDisplayName: 'Engineering',
      },
      members: [
        {
          agentId: 'a1',
          displayName: 'Alice',
          role: 'executor',
          organizationNodeId: 'n1',
          organizationNodeName: 'Team',
          inCurrentRoom: true,
          status: 'active',
          boundOnOrgTree: true,
          agentsTableOnly: false,
        },
      ],
      counts: {
        total: 1,
        employees: 1,
        directors: 0,
        inCurrentRoom: 1,
        syncDriftAgentsTableOnly: 0,
      },
      sourceMeta: [],
    });
    expect(block).toContain('organization.department_roster');
    expect(block).toContain('Alice');
    expect(block).toContain('编制共 1 人');
  });

  it('states zero roster when pack is empty', () => {
    const block = buildDepartmentRosterPromptBlock(null);
    expect(block).toContain('编制为空');
  });
});
