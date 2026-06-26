jest.mock('../pipeline-v2/pipeline-v2.forward-ref.js', () => ({
  lazyCollaborationPipelineV2Service: () => class CollaborationPipelineV2Service {},
  lazyCollaborationMainRoomFlowService: () => class CollaborationMainRoomFlowService {},
  lazyCollaborationMainRoomIntentService: () => class CollaborationMainRoomIntentService {},
  lazyCollaborationMainRoomOrchestrationService: () => class CollaborationMainRoomOrchestrationService {},
  lazyCollaborationMainRoomReplayService: () => class CollaborationMainRoomReplayService {},
  lazyCollaborationPipelineRuleFallbackService: () => class CollaborationPipelineRuleFallbackService {},
}));

import { of } from 'rxjs';
import { AgentPeerSummonService } from './agent-peer-summon.service.js';
import type { CollaborationAgentPeerSummonRequestedEvent } from '@contracts/events';

describe('AgentPeerSummonService', () => {
  function makeEvent(
    overrides: Partial<CollaborationAgentPeerSummonRequestedEvent['data']> = {},
  ): CollaborationAgentPeerSummonRequestedEvent {
    return {
      eventId: 'e1',
      eventType: 'collaboration.agent-peer-summon.requested',
      aggregateId: 'msg-1',
      aggregateType: 'chat_message',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'c1',
      data: {
        companyId: 'c1',
        roomId: 'room-main',
        sourceMessageId: 'msg-1',
        senderAgentId: 'ceo-1',
        targetAgentId: 'dir-eng',
        contentPreview: '请工程部总监自我介绍',
        summonTargetAgentIds: ['dir-eng'],
        traceId: 'trace-1',
        requestedAt: new Date().toISOString(),
        ...overrides,
      },
    };
  }

  function svc(opts: {
    enabled?: boolean;
    roomType?: string;
    handleDirectedReplyPath?: jest.Mock;
    setNxPx?: jest.Mock;
    continueViaCeoToolPath?: jest.Mock;
  }) {
    const handleDirectedReplyPath =
      opts.handleDirectedReplyPath ??
      jest.fn().mockResolvedValue({
        output: { payload: { responderAgentIds: ['dir-eng'] } },
      });
    const continueViaCeoToolPath =
      opts.continueViaCeoToolPath ??
      jest.fn().mockResolvedValue({ continued: false });
    return {
      service: new AgentPeerSummonService(
        {
          isCollabAgentPeerSummonEnabled: () => opts.enabled !== false,
          getCollabAgentPeerSummonMaxPerEvent: () => 1,
          getRedisKeyPrefix: () => 'pfx:',
          getWorkerActorUserId: () => 'worker-actor',
          getCollaborationMentionRpcTimeoutMs: () => 5000,
        } as any,
        { setNxPx: opts.setNxPx ?? jest.fn().mockResolvedValue(true) } as any,
        {
          buildRoomContext: jest.fn().mockResolvedValue({
            roomType: opts.roomType ?? 'main',
            memberDirectory: [
              { memberType: 'agent', memberId: 'ceo-1' },
              { memberType: 'agent', memberId: 'dir-eng' },
            ],
            orgSnapshot: { departments: [{ id: 'dept-1' }] },
          }),
        } as any,
        {
          getActiveAgents: jest.fn().mockResolvedValue([
            {
              id: 'dir-eng',
              role: 'director',
              organizationNodeId: 'dept-1',
            },
          ]),
        } as any,
        { handleDirectedReplyPath } as any,
        {
          recordDirectorSummoned: jest.fn().mockResolvedValue(undefined),
        } as any,
        {
          continueViaCeoToolPath,
        } as any,
        {
          send: jest.fn(() => of({ items: [{ id: 'ceo-1' }] })),
        } as any,
      ),
      handleDirectedReplyPath,
      continueViaCeoToolPath,
    };
  }

  it('invokes handleDirectedReplyPath for whitelisted director on main room', async () => {
    const { service, handleDirectedReplyPath } = svc({});
    await service.handleRequested(makeEvent());
    expect(handleDirectedReplyPath).toHaveBeenCalledTimes(1);
    const [intent, input] = handleDirectedReplyPath.mock.calls[0];
    expect(intent.intentType).toBe('direct_summon');
    expect(intent.targetIds).toEqual(['dir-eng']);
    expect(input.messageSource).toBe('agent_peer_summon');
    expect(input.senderType).toBe('agent');
  });

  it('continues sequential intro chain via CEO tool path after director replies', async () => {
    const continueViaCeoToolPath = jest
      .fn()
      .mockResolvedValue({ continued: true, toolNames: ['tool.message_send_to_agent'] });
    const { service, continueViaCeoToolPath: chainMock } = svc({
      continueViaCeoToolPath,
    });
    await service.handleRequested(makeEvent());
    expect(chainMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'c1',
        completedDirectorAgentId: 'dir-eng',
        ceoAgentId: 'ceo-1',
      }),
    );
  });

  it('skips when disabled', async () => {
    const { service, handleDirectedReplyPath } = svc({ enabled: false });
    await service.handleRequested(makeEvent());
    expect(handleDirectedReplyPath).not.toHaveBeenCalled();
  });

  it('skips self summon', async () => {
    const { service, handleDirectedReplyPath } = svc({});
    await service.handleRequested(
      makeEvent({ senderAgentId: 'dir-eng', targetAgentId: 'dir-eng' }),
    );
    expect(handleDirectedReplyPath).not.toHaveBeenCalled();
  });

  it('skips non-main room', async () => {
    const { service, handleDirectedReplyPath } = svc({ roomType: 'department' });
    await service.handleRequested(makeEvent());
    expect(handleDirectedReplyPath).not.toHaveBeenCalled();
  });
});
