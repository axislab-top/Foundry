import { MainRoomCeoGroundingService } from './main-room-ceo-grounding.service.js';
import type { RoomContext } from './contracts/collaboration-2026.contracts.js';
import { MAIN_ROOM_REPLAY_FACT_LAYER_CHAR_LIMITS } from './replay/main-room-replay-fact-layer.contract.js';
import { REPLAY_UNTRUSTED_MEMORY_BANNER, REPLAY_UNTRUSTED_TRANSCRIPT_BANNER } from './replay/main-room-replay-trust-boundary.util.js';
import type { ContextGroundingPlan } from './context/context-grounding-plan.js';

describe('MainRoomCeoGroundingService', () => {
  const roomContext: RoomContext = {
    companyId: 'c1',
    roomId: 'r1',
    roomType: 'main',
    roomName: 'Main',
    organizationNodeId: null,
    members: [],
    memberDirectory: [
      {
        memberType: 'agent',
        memberId: 'agent-1',
        displayName: '销售总监',
        roleLabel: '销售总监',
        departmentDisplayName: '销售部',
      },
    ],
    orgSnapshot: {
      departments: [{ id: 'd1', name: '产品部', slug: 'product' }],
      updatedAt: new Date().toISOString(),
    },
  };

  let companyCortex: { getCompanyBrainContext: jest.Mock };
  let memoryCrossCut: { retrieveTopCompanyFactsForCeoPack: jest.Mock };
  let config: Record<string, jest.Mock>;
  let svc: MainRoomCeoGroundingService;

  const fullPlan: ContextGroundingPlan = {
    prefetchBlocks: ['speaker', 'transcript', 'memory', 'company_profile', 'org_snapshot', 'room_roster'],
    factsQueryTypes: ['room_members'],
    toolPolicy: 'tools_allowed',
    confidence: 0.9,
    source: 'llm',
  };

  const minimalPlan: ContextGroundingPlan = {
    prefetchBlocks: ['speaker', 'transcript'],
    factsQueryTypes: [],
    toolPolicy: 'tools_allowed',
    confidence: 0.5,
    source: 'llm_fallback',
  };

  beforeEach(() => {
    companyCortex = { getCompanyBrainContext: jest.fn() };
    memoryCrossCut = { retrieveTopCompanyFactsForCeoPack: jest.fn() };
    config = {};
    svc = new MainRoomCeoGroundingService(
      config as never,
      companyCortex as never,
      memoryCrossCut as never,
    );
  });

  it('serializes cortex and memory when plan selects company_profile and memory', async () => {
    companyCortex.getCompanyBrainContext.mockResolvedValue({
      profile: 'Co profile',
      profileHit: true,
      strategicNotes: ['alpha-note'],
      memorySignals: ['beta-signal'],
      activeAgentCount: 2,
      roomMemberCount: 4,
      missingFields: [],
      summary: '',
    });
    memoryCrossCut.retrieveTopCompanyFactsForCeoPack.mockResolvedValue({
      lines: ['mem fact one', 'mem fact two'],
    });

    const pack = { factsBlock: '', memoryBlock: 'pack-memory', transcriptBlock: 'pack-transcript' };
    const { serialized, diagnostics } = await svc.buildReplayDelegateFactLayer({
      companyId: 'c1',
      roomContext,
      ceoAgentId: null,
      userText: 'grow revenue',
      traceId: 'tr-42',
      pack,
      plan: fullPlan,
    });

    expect(companyCortex.getCompanyBrainContext).toHaveBeenCalled();
    expect(memoryCrossCut.retrieveTopCompanyFactsForCeoPack).toHaveBeenCalled();
    expect(serialized).toContain('strategic_notes: alpha-note');
    expect(serialized).toContain('【公司级 Memory 事实 · Top 2】');
    expect(serialized).toContain(REPLAY_UNTRUSTED_TRANSCRIPT_BANNER);
    expect(serialized).toContain('pack-transcript');
    expect(serialized).toContain(REPLAY_UNTRUSTED_MEMORY_BANNER);
    expect(serialized).toContain('pack-memory');
    expect(diagnostics.prefetchBlocks).toEqual(fullPlan.prefetchBlocks);
    expect(diagnostics.factLayerMode).toBe('minimal_tools');
  });

  it('omits roster when plan does not include room_roster', async () => {
    companyCortex.getCompanyBrainContext.mockResolvedValue({
      profile: '',
      profileHit: false,
      strategicNotes: [],
      memorySignals: [],
      activeAgentCount: 0,
      roomMemberCount: 0,
      missingFields: [],
      summary: '',
    });
    memoryCrossCut.retrieveTopCompanyFactsForCeoPack.mockResolvedValue({ lines: [] });

    const { serialized, diagnostics } = await svc.buildReplayDelegateFactLayer({
      companyId: 'c1',
      roomContext,
      ceoAgentId: null,
      userText: '你在吗',
      traceId: 't',
      pack: { factsBlock: '', memoryBlock: '', transcriptBlock: 't-block' },
      plan: minimalPlan,
    });

    expect(serialized).not.toContain('room_member_directory');
    expect(serialized).not.toContain('销售总监');
    expect(serialized).not.toContain('【组织部门');
    expect(companyCortex.getCompanyBrainContext).not.toHaveBeenCalled();
    expect(diagnostics.roomRosterChars).toBe(0);
    expect(diagnostics.orgSnapshotChars).toBe(0);
  });

  it('includes roster block when plan selects room_roster', async () => {
    const rosterPlan: ContextGroundingPlan = {
      ...minimalPlan,
      prefetchBlocks: ['speaker', 'transcript', 'room_roster'],
    };
    const { serialized } = await svc.buildReplayDelegateFactLayer({
      companyId: 'c1',
      roomContext,
      ceoAgentId: null,
      userText: '群里有哪些人',
      traceId: 't',
      pack: { factsBlock: '', memoryBlock: '', transcriptBlock: '' },
      plan: rosterPlan,
      factLayerMode: 'minimal_tools',
    });
    expect(serialized).toContain('销售总监');
    expect(serialized).toContain('【房内成员 — 摘要】');
    expect(serialized).not.toContain('room_member_directory 2026');
  });

  it('uses full roster block in full_prefetch mode', async () => {
    const rosterPlan: ContextGroundingPlan = {
      ...minimalPlan,
      prefetchBlocks: ['speaker', 'room_roster'],
    };
    const { serialized } = await svc.buildReplayDelegateFactLayer({
      companyId: 'c1',
      roomContext,
      ceoAgentId: null,
      userText: '群里有哪些人',
      traceId: 't',
      pack: { factsBlock: '', memoryBlock: '', transcriptBlock: '' },
      plan: rosterPlan,
      factLayerMode: 'full_prefetch',
    });
    expect(serialized).toContain('room_member_directory 2026');
  });

  it('omits company memory block when retrieval returns no lines', async () => {
    companyCortex.getCompanyBrainContext.mockResolvedValue({
      profile: 'p',
      profileHit: true,
      strategicNotes: [],
      memorySignals: [],
      activeAgentCount: 0,
      roomMemberCount: 0,
      missingFields: [],
      summary: '',
    });
    memoryCrossCut.retrieveTopCompanyFactsForCeoPack.mockResolvedValue({ lines: [] });

    const memoryPlan: ContextGroundingPlan = {
      ...minimalPlan,
      prefetchBlocks: ['speaker', 'company_profile', 'memory'],
    };
    const { serialized, diagnostics } = await svc.buildReplayDelegateFactLayer({
      companyId: 'c1',
      roomContext,
      ceoAgentId: null,
      userText: 'x',
      traceId: 't',
      pack: { factsBlock: '', memoryBlock: '', transcriptBlock: '' },
      plan: memoryPlan,
    });

    expect(serialized).not.toContain('【公司级 Memory 事实');
    expect(diagnostics.companyMemoryFactsChars).toBe(0);
  });

  it('treats cortex RPC failure as empty profile and cortex core', async () => {
    companyCortex.getCompanyBrainContext.mockRejectedValue(new Error('rpc down'));
    memoryCrossCut.retrieveTopCompanyFactsForCeoPack.mockResolvedValue({ lines: ['only memory'] });

    const memoryPlan: ContextGroundingPlan = {
      ...minimalPlan,
      prefetchBlocks: ['speaker', 'company_profile', 'memory'],
    };
    const { serialized, diagnostics } = await svc.buildReplayDelegateFactLayer({
      companyId: 'c1',
      roomContext,
      ceoAgentId: null,
      userText: 'y',
      traceId: 't2',
      pack: { factsBlock: '', memoryBlock: '', transcriptBlock: '' },
      plan: memoryPlan,
    });

    expect(serialized).not.toContain('【Cortex 核心】');
    expect(diagnostics.syncedCompanyProfileChars).toBe(0);
    expect(serialized).toContain('【公司级 Memory 事实 · Top 1】');
    expect(serialized).toContain(REPLAY_UNTRUSTED_MEMORY_BANNER);
  });

  it('rejects non-main room', async () => {
    const directCtx = { ...roomContext, roomType: 'department' as const };
    await expect(
      svc.buildReplayDelegateFactLayer({
        companyId: 'c1',
        roomContext: directCtx,
        ceoAgentId: null,
        userText: 'z',
        traceId: 't',
        pack: { factsBlock: '', memoryBlock: '', transcriptBlock: '' },
        plan: minimalPlan,
      }),
    ).rejects.toThrow('main_room_ceo_grounding_requires_main_room');
  });

  it('flags profile truncation and appends a compact capacity banner', async () => {
    const longProfile = 'P'.repeat(MAIN_ROOM_REPLAY_FACT_LAYER_CHAR_LIMITS.profile + 80);
    companyCortex.getCompanyBrainContext.mockResolvedValue({
      profile: longProfile,
      profileHit: true,
      strategicNotes: [],
      memorySignals: [],
      activeAgentCount: 0,
      roomMemberCount: 0,
      missingFields: [],
      summary: '',
    });
    memoryCrossCut.retrieveTopCompanyFactsForCeoPack.mockResolvedValue({ lines: [] });

    const profilePlan: ContextGroundingPlan = {
      ...minimalPlan,
      prefetchBlocks: ['speaker', 'company_profile'],
    };
    const { serialized, diagnostics } = await svc.buildReplayDelegateFactLayer({
      companyId: 'c1',
      roomContext,
      ceoAgentId: null,
      userText: 'q',
      traceId: 't3',
      pack: { factsBlock: '', memoryBlock: '', transcriptBlock: '' },
      plan: profilePlan,
    });

    expect(diagnostics.truncation.profile).toBe(true);
    expect(serialized).toContain('【容量边界】');
    expect(serialized).toContain('档案');
  });
});
