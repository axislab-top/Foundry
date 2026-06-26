import { resolveSummonTargetsFromRoomNlCopy } from './intent-summon-nl-resolve.util.js';
import type { RoomContext } from './contracts/collaboration-2026.contracts.js';

function makeRoom(agentId: string, roleLabel: string, displayName: string): RoomContext {
  return {
    companyId: 'c',
    roomId: 'r',
    roomType: 'main',
    roomName: 'main',
    organizationNodeId: null,
    members: [{ memberType: 'agent', memberId: agentId }],
    memberDirectory: [
      {
        memberType: 'agent',
        memberId: agentId,
        displayName,
        roleLabel,
      },
    ],
    orgSnapshot: { departments: [{ id: 'd1', name: 'Sales', slug: 'sales' }], updatedAt: new Date().toISOString() },
  };
}

describe('resolveSummonTargetsFromRoomNlCopy', () => {
  it('resolves unique agent by 总监 phrase', () => {
    const ctx = makeRoom('agent-sales-1', '销售总监', '王小售');
    expect(resolveSummonTargetsFromRoomNlCopy('让销售总监出来说说下季度目标', ctx, 'ceo-1')).toEqual(['agent-sales-1']);
  });

  it('returns empty when role phrase names nobody on roster', () => {
    const ctx: RoomContext = {
      ...makeRoom('a1', '销售总监', 'U1'),
      memberDirectory: [
        { memberType: 'agent', memberId: 'a1', displayName: 'U1', roleLabel: '销售总监' },
        { memberType: 'agent', memberId: 'a2', displayName: 'U2', roleLabel: '销售经理' },
      ],
      members: [
        { memberType: 'agent', memberId: 'a1' },
        { memberType: 'agent', memberId: 'a2' },
      ],
    };
    expect(resolveSummonTargetsFromRoomNlCopy('让查无此人说说', ctx, null)).toEqual([]);
  });

  it('resolves CEO by summon phrase and roleLabel CEO', () => {
    const ctx = makeRoom('ceo-agent', 'CEO', '老板');
    expect(resolveSummonTargetsFromRoomNlCopy('让CEO讲讲', ctx, 'ceo-agent')).toEqual(['ceo-agent']);
  });

  it('resolves CEO from greeting copy when roleLabel is CEO', () => {
    const ctx = makeRoom('ceo-agent', 'CEO', '老板');
    expect(
      resolveSummonTargetsFromRoomNlCopy('你好，我亲爱的CEO，为什么会没有命中CEO呢？', ctx, 'ceo-agent'),
    ).toEqual(['ceo-agent']);
  });

  it('prefers configured ceo when generic CEO token ties CEO vs CEO助理', () => {
    const ctx: RoomContext = {
      ...makeRoom('real-ceo', 'CEO', '老板'),
      memberDirectory: [
        { memberType: 'agent', memberId: 'real-ceo', displayName: '老板', roleLabel: 'CEO' },
        { memberType: 'agent', memberId: 'asst', displayName: '小李', roleLabel: 'CEO助理' },
      ],
      members: [
        { memberType: 'agent', memberId: 'real-ceo' },
        { memberType: 'agent', memberId: 'asst' },
      ],
    };
    expect(resolveSummonTargetsFromRoomNlCopy('你好，我亲爱的CEO', ctx, 'real-ceo')).toEqual(['real-ceo']);
  });

  it('does not match CEO助理 roster field for English CEO needle', () => {
    const ctx: RoomContext = {
      ...makeRoom('asst', 'CEO助理', '小李'),
      memberDirectory: [{ memberType: 'agent', memberId: 'asst', displayName: '小李', roleLabel: 'CEO助理' }],
      members: [{ memberType: 'agent', memberId: 'asst' }],
    };
    expect(resolveSummonTargetsFromRoomNlCopy('你好，我亲爱的CEO', ctx, null)).toEqual([]);
  });

  it('resolves English role label after summon verb', () => {
    const ctx = makeRoom('agent-en-1', 'Sales Director', 'Jane');
    expect(resolveSummonTargetsFromRoomNlCopy('请Sales Director讲讲季度进展', ctx, null)).toEqual(['agent-en-1']);
  });

  it('resolves 「…总监呢？出来」when displayName is English but expertise/dept carry CN', () => {
    const ctx: RoomContext = {
      companyId: 'c',
      roomId: 'r',
      roomType: 'main',
      roomName: 'main',
      organizationNodeId: null,
      members: [{ memberType: 'agent', memberId: 'ops-72' }],
      memberDirectory: [
        {
          memberType: 'agent',
          memberId: 'ops-72',
          displayName: 'Operations Director',
          roleLabel: 'director',
          departmentDisplayName: '生产运营部',
          expertiseSnippet: '负责生产运营、供应链及流程优化；职务表述含「生产运营总监」。',
        },
      ],
      orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
    };
    expect(resolveSummonTargetsFromRoomNlCopy('生产运营总监呢？出来', ctx, 'ceo-1')).toEqual(['ops-72']);
  });

  it('matches CN department fragment against departmentDisplayName', () => {
    const ctx: RoomContext = {
      companyId: 'c',
      roomId: 'r',
      roomType: 'main',
      roomName: 'main',
      organizationNodeId: null,
      members: [{ memberType: 'agent', memberId: 'ops-72' }],
      memberDirectory: [
        {
          memberType: 'agent',
          memberId: 'ops-72',
          displayName: 'Operations Director',
          roleLabel: 'director',
          departmentDisplayName: '生产部',
          expertiseSnippet: 'Ops lead.',
        },
      ],
      orgSnapshot: { departments: [], updatedAt: new Date().toISOString() },
    };
    expect(resolveSummonTargetsFromRoomNlCopy('生产部总监，出来', ctx, 'ceo-1')).toEqual(['ops-72']);
  });
});
