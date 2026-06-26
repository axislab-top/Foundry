import {
  buildDepartmentRoomRoster,
  resolveDepartmentStructuralRoute,
} from './department-room-structural-route.util.js';

describe('department-room-structural-route.util', () => {
  const roomContext = {
    roomId: 'r1',
    members: [
      { memberType: 'agent', memberId: 'dir1' },
      { memberType: 'agent', memberId: 'emp1' },
    ],
    memberDirectory: [
      { memberType: 'agent', memberId: 'dir1', roleLabel: 'director', displayName: '总监' },
      { memberType: 'agent', memberId: 'emp1', roleLabel: 'employee', displayName: '员工' },
    ],
  } as any;

  it('employee-only in-room mentions short-circuit to employee_direct', () => {
    const roster = buildDepartmentRoomRoster(roomContext);
    const route = resolveDepartmentStructuralRoute({
      roomContext,
      mentionedAgentIds: ['emp1'],
      directorAgentId: 'dir1',
      roster,
    });
    expect(route.kind).toBe('employee_direct');

    if (route.kind === 'employee_direct') {

      expect(route.targetAgentIds).toEqual(['emp1']);

    }

  });



  it('no mentions requires classifier', () => {

    const roster = buildDepartmentRoomRoster(roomContext);

    const route = resolveDepartmentStructuralRoute({

      roomContext,

      mentionedAgentIds: [],

      directorAgentId: 'dir1',

      roster,

    });

    expect(route.kind).toBe('classify');

  });

});


