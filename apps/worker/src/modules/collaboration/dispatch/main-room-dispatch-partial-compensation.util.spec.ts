import { notifyMainRoomDispatchPartialFailureIfSkipped } from './main-room-dispatch-partial-compensation.util.js';

describe('notifyMainRoomDispatchPartialFailureIfSkipped', () => {
  it('calls compensation when skipped rows exist', async () => {
    const compensation = {
      notifyDispatchPartialFailure: jest.fn().mockResolvedValue(undefined),
    };
    const input = {
      companyId: 'co1',
      roomId: 'main-r1',
      threadId: null,
      ceoAgentId: 'ceo-1',
      messageId: 'plan-msg-1',
    } as any;
    const roomContext = {
      orgSnapshot: {
        departments: [{ slug: 'engineering', name: '工程部' }],
      },
    } as any;

    await notifyMainRoomDispatchPartialFailureIfSkipped(compensation as any, {
      input,
      roomContext,
      flushResult: {
        assignedCount: 2,
        skipped: [{ departmentSlug: 'engineering', reason: 'no_director', planTaskId: 't1' }],
      },
      parentGoalTaskId: 'goal-1',
      planMessageId: 'plan-msg-1',
    });

    expect(compensation.notifyDispatchPartialFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co1',
        mainRoomId: 'main-r1',
        ceoAgentId: 'ceo-1',
        planMessageId: 'plan-msg-1',
        parentGoalTaskId: 'goal-1',
        skipped: expect.arrayContaining([
          expect.objectContaining({ departmentSlug: 'engineering', reason: 'no_director' }),
        ]),
      }),
    );
  });

  it('skips when no skipped rows', async () => {
    const compensation = { notifyDispatchPartialFailure: jest.fn() };
    await notifyMainRoomDispatchPartialFailureIfSkipped(compensation as any, {
      input: { companyId: 'co1', roomId: 'r1', ceoAgentId: 'ceo-1' } as any,
      roomContext: {} as any,
      flushResult: { assignedCount: 3, skipped: [] },
      parentGoalTaskId: 'goal-1',
    });
    expect(compensation.notifyDispatchPartialFailure).not.toHaveBeenCalled();
  });
});
