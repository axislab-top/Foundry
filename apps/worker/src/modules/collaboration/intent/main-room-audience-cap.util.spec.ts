import {
  capMainRoomDirectAgentIds,
  filterMainRoomAudienceRoutableAgentIds,
  isMainRoomInRoomEmployeeAgent,
} from './main-room-audience-cap.util.js';

describe('capMainRoomDirectAgentIds', () => {
  it('dedupes and truncates', () => {
    expect(capMainRoomDirectAgentIds(['a', 'a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});

describe('filterMainRoomAudienceRoutableAgentIds', () => {
  const roomAgentIds = new Set(['dir-1', 'emp-1', 'emp-2', 'emp-3']);
  const roster = [
    { id: 'dir-1', role: 'director', organizationNodeId: 'd1' },
    { id: 'emp-1', role: 'employee', organizationNodeId: 'd1' },
    { id: 'emp-2', role: 'employee', organizationNodeId: 'd1' },
    { id: 'emp-3', role: 'employee', organizationNodeId: 'd1' },
  ];

  it('allows high-confidence employees up to cap', () => {
    const out = filterMainRoomAudienceRoutableAgentIds({
      rawIds: ['emp-1', 'emp-2', 'emp-3'],
      directorWhitelist: new Set(),
      mentionAllow: new Set(),
      ceoInRoom: false,
      ceoId: '',
      roster,
      roomAgentIds,
      maxDirect: 8,
      employeeNaturalEnabled: true,
      maxEmployeeNatural: 2,
      minConfidenceForEmployee: 0.78,
      audienceConfidence: 0.85,
    });
    expect(out.allowedEmployeeIds).toEqual(['emp-1', 'emp-2']);
    expect(out.filtered).toEqual(['emp-1', 'emp-2']);
    expect(out.droppedEmployeeIds).toEqual(['emp-3']);
  });

  it('drops employees below confidence unless @mentioned', () => {
    const out = filterMainRoomAudienceRoutableAgentIds({
      rawIds: ['emp-1'],
      directorWhitelist: new Set(),
      mentionAllow: new Set(),
      ceoInRoom: false,
      ceoId: '',
      roster,
      roomAgentIds,
      maxDirect: 8,
      employeeNaturalEnabled: true,
      maxEmployeeNatural: 2,
      minConfidenceForEmployee: 0.78,
      audienceConfidence: 0.5,
    });
    expect(out.filtered).toEqual([]);
    expect(out.allowedEmployeeIds).toEqual([]);
  });

  it('allows @mentioned employee regardless of confidence', () => {
    const out = filterMainRoomAudienceRoutableAgentIds({
      rawIds: ['emp-1'],
      directorWhitelist: new Set(),
      mentionAllow: new Set(['emp-1']),
      ceoInRoom: false,
      ceoId: '',
      roster,
      roomAgentIds,
      maxDirect: 8,
      employeeNaturalEnabled: true,
      maxEmployeeNatural: 2,
      minConfidenceForEmployee: 0.78,
      audienceConfidence: 0.4,
    });
    expect(out.filtered).toEqual(['emp-1']);
  });

  it('when employee natural disabled, only directors pass', () => {
    const out = filterMainRoomAudienceRoutableAgentIds({
      rawIds: ['dir-1', 'emp-1'],
      directorWhitelist: new Set(['dir-1']),
      mentionAllow: new Set(),
      ceoInRoom: false,
      ceoId: '',
      roster,
      roomAgentIds,
      maxDirect: 8,
      employeeNaturalEnabled: false,
      maxEmployeeNatural: 2,
      minConfidenceForEmployee: 0.78,
      audienceConfidence: 0.9,
    });
    expect(out.filtered).toEqual(['dir-1']);
  });
});

describe('isMainRoomInRoomEmployeeAgent', () => {
  it('detects employee in room', () => {
    const room = new Set(['e1']);
    const roster = [{ id: 'e1', role: 'employee' }];
    expect(isMainRoomInRoomEmployeeAgent('e1', roster, room)).toBe(true);
    expect(isMainRoomInRoomEmployeeAgent('e1', [{ id: 'e1', role: 'director' }], room)).toBe(false);
  });
});
