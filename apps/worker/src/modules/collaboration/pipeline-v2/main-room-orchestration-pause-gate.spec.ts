jest.mock('./pipeline-v2.forward-ref.js', () => ({
  lazyCollaborationPipelineV2Service: () => class CollaborationPipelineV2Service {},
  lazyCollaborationMainRoomFlowService: () => class CollaborationMainRoomFlowService {},
  lazyCollaborationMainRoomIntentService: () => class CollaborationMainRoomIntentService {},
  lazyCollaborationMainRoomSupervisionService: () => class CollaborationMainRoomSupervisionService {},
  lazyCollaborationMainRoomOrchestrationService: () => class CollaborationMainRoomOrchestrationService {},
  lazyCollaborationMainRoomReplayService: () => class CollaborationMainRoomReplayService {},
  lazyCollaborationPipelineRuleFallbackService: () => class CollaborationPipelineRuleFallbackService {},
}));

import { CollaborationMainRoomOrchestrationService } from './main-room-orchestration.service.js';

describe('CollaborationMainRoomOrchestrationService sync-heavy pause gate', () => {
  it('skips runMainRoomDispatchPlanPath when orchestration paused', async () => {
    const orchestrationPause = {
      isPaused: jest.fn().mockResolvedValue(true),
    } as any;
    const mainRoomDispatchPlanSession = {
      get: jest.fn().mockResolvedValue(null),
    } as any;
    const pipeline = {
      recordExecutionStateTransition: jest.fn().mockResolvedValue(undefined),
    } as any;
    const config = {
      getCollabAssignableDepartmentPolicy: () => 'all',
      isCollabProgramSsotEnabled: () => false,
    } as any;

    const orchestration = new CollaborationMainRoomOrchestrationService(
      config,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orchestrationPause,
      {} as any,
      {} as any,
      pipeline,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { isEnabled: () => false } as any,
    );

    const intentDecision = {
      intentType: 'orchestration',
      confidence: 0.9,
      routingHints: { suggestedDepartments: [] },
    } as any;
    const input = {
      companyId: 'c1',
      roomId: 'r1',
      messageId: 'msg-1',
      contentText: '发布任务',
      humanSenderId: 'user-1',
      threadId: null,
    } as any;

    const out = await orchestration.runMainRoomDispatchPlanPath({
      input,
      roomContext: { roomType: 'main', orgSnapshot: { departments: [] } } as any,
      intentDecision,
      traceId: 'trace-1',
    });

    expect(out.routePath).toBe('orchestration_paused');
    expect(out.output?.message).toBe('sync_heavy_skipped_orchestration_paused');
    expect(mainRoomDispatchPlanSession.get).not.toHaveBeenCalled();
  });
});
