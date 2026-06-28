import { ExperienceRecapGeneratedListener } from './experience-recap-generated.listener.js';

describe('ExperienceRecapGeneratedListener', () => {
  it('should load dynamic policies from recap event', async () => {
    let handler: ((event: any) => Promise<void>) | null = null;
    const messaging = {
      subscribeWithBackoff: jest.fn((_topic: string, cb: any) => {
        handler = cb;
      }),
    } as any;

    const registry = {
      loadDynamicPolicies: jest.fn().mockReturnValue(2),
    } as any;

    const monitoring = {
      recordExperienceDynamicPoliciesApplied: jest.fn(),
      observeExperienceDynamicPolicyApplyLatencyMs: jest.fn(),
    } as any;

    const listener = new ExperienceRecapGeneratedListener(messaging, registry, monitoring);
    listener.onModuleInit();

    expect(messaging.subscribeWithBackoff).toHaveBeenCalledWith(
      'experience.recap.generated',
      expect.any(Function),
      expect.any(Object),
    );

    await handler?.({
      data: {
        recapId: 'recap-1',
        discussionId: 'thread-1',
        recap: {
          policySuggestions: [
            { policyKey: 'high_risk_approval_threshold', suggestedValue: 0.9, confidence: 0.8 },
          ],
        },
      },
    });

    expect(registry.loadDynamicPolicies).toHaveBeenCalledWith(
      expect.objectContaining({
        policySuggestions: expect.any(Array),
      }),
    );
    expect(monitoring.recordExperienceDynamicPoliciesApplied).toHaveBeenCalledWith(2);
  });
});

