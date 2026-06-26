import { CeoSequentialPeerIntroContinuationService } from './ceo-sequential-peer-intro-continuation.service.js';

describe('CeoSequentialPeerIntroContinuationService', () => {
  it('continues chain via direct peer summon', async () => {
    const session = {
      shouldContinueAfterDirectorReply: jest.fn().mockResolvedValue(true),
      acquireChainContinueSlot: jest.fn().mockResolvedValue(true),
      pickNextDirector: jest.fn().mockResolvedValue({
        agentId: 'dir-2',
        displayName: '产品总监',
        departmentName: '产品部',
        organizationNodeId: 'dept-2',
      }),
      findDirectorById: jest.fn().mockResolvedValue({
        agentId: 'dir-1',
        displayName: '工程总监',
        departmentName: '工程部',
        organizationNodeId: 'dept-1',
      }),
      deactivateSession: jest.fn(),
    };
    const peerSummonDirect = {
      summonDirectorInMainRoom: jest.fn().mockResolvedValue({ ok: true, summonAccepted: true }),
    };
    const svc = new CeoSequentialPeerIntroContinuationService(session as never, peerSummonDirect as never);

    const out = await svc.continueViaCeoToolPath({
      companyId: 'c1',
      roomId: 'r1',
      threadId: null,
      completedDirectorAgentId: 'dir-1',
      anchorMessageId: 'msg-1',
      traceId: 't1',
      ceoAgentId: 'ceo-1',
    });

    expect(out.continued).toBe(true);
    expect(peerSummonDirect.summonDirectorInMainRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        ceoAgentId: 'ceo-1',
        targetAgentId: 'dir-2',
      }),
    );
  });
});
