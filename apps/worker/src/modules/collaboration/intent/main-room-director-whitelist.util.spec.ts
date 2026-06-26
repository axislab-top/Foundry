import { buildMainRoomDirectorAgentWhitelist } from './main-room-director-whitelist.util.js';
import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { AgentDirectorySlice } from '../context/agents-active-directory-cache.service.js';

function makeCtx(agentId: string): RoomContext {
  return {
    companyId: 'c',
    roomId: 'r',
    roomType: 'main',
    roomName: 'main',
    organizationNodeId: null,
    members: [{ memberType: 'agent', memberId: agentId }],
    memberDirectory: [
      { memberType: 'agent', memberId: agentId, displayName: 'D1', roleLabel: '销售总监' },
    ],
    orgSnapshot: {
      departments: [{ id: 'dept-sales', name: 'Sales', slug: 'sales' }],
      updatedAt: new Date().toISOString(),
    },
  };
}

describe('buildMainRoomDirectorAgentWhitelist', () => {
  it('includes in-room director linked to org department', () => {
    const ctx = makeCtx('agent-1');
    const roster: AgentDirectorySlice[] = [
      { id: 'agent-1', name: 'A', role: 'director', organizationNodeId: 'dept-sales' },
      { id: 'agent-2', name: 'B', role: 'manager', organizationNodeId: 'dept-sales' },
    ];
    const w = buildMainRoomDirectorAgentWhitelist(ctx, roster);
    expect([...w]).toEqual(['agent-1']);
  });

  it('excludes director not in room', () => {
    const ctx = makeCtx('agent-1');
    const roster: AgentDirectorySlice[] = [
      { id: 'agent-x', name: 'X', role: 'director', organizationNodeId: 'dept-sales' },
    ];
    expect(buildMainRoomDirectorAgentWhitelist(ctx, roster).size).toBe(0);
  });
});
