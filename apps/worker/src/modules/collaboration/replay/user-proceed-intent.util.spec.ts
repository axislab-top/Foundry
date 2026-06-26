import {
  hasRehydratedAuthorizationContext,
  isUserProceedWithoutMoreQuestions,
  rehydrateAuthorizationDraftFromMetadata,
} from './user-proceed-intent.util.js';

describe('user-proceed-intent.util', () => {
  it('isUserProceedWithoutMoreQuestions accepts card metadata only', () => {
    expect(
      isUserProceedWithoutMoreQuestions({
        userText: '嗯',
        confirmationIntent: 'confirm_execution',
      }),
    ).toBe(true);
    expect(
      isUserProceedWithoutMoreQuestions({
        userText: '确认下发',
        confirmationIntent: 'dispatch_plan_confirm_flush',
        userConfirmedDispatchFlush: true,
      }),
    ).toBe(true);
    expect(
      isUserProceedWithoutMoreQuestions({
        userText: '一切你来决定，要产出',
        confirmationIntent: null,
      }),
    ).toBe(false);
  });

  it('rehydrateAuthorizationDraftFromMetadata reads ceoAlignment', () => {
    const draft = rehydrateAuthorizationDraftFromMetadata({
      ceoAlignment: { phase: 'awaiting_execution_confirm', draftGoalSummary: '发布新品' },
    });
    expect(draft).toBe('发布新品');
  });

  it('hasRehydratedAuthorizationContext falls back to message metadata', () => {
    expect(
      hasRehydratedAuthorizationContext({
        alignmentSession: null,
        existingDraft: null,
        messageMetadata: {
          dispatchPlan: { goalSummary: 'Q3 增长计划' },
        },
      }),
    ).toBe(true);
  });
});
