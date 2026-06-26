import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { CeoDecisionInput, CeoDecisionResult } from '../ceo/dto/ceo-v2-pipeline.types.js';
import { CeoDecisionInputBridge, NextStep } from '../ceo/dto/ceo-v2-pipeline.types.js';
import { L1PostNormalizerService } from './l1-post-normalizer.service.js';

describe('L1PostNormalizerService', () => {
  const baseInput: CeoDecisionInput = {
    companyId: 'c1',
    roomId: 'r1',
    messageId: 'm1',
    routingRootMessageId: 'm1',
    contentText: 'hello',
    threadId: null,
    mentionedAgentIds: [],
    ceoAgentId: null,
    humanSenderId: 'u1',
    recentInterlocutorAgentId: null,
    recentInterlocutorLastPreview: null,
    roomAgentRosterBrief: null,
  };

  const unified: CollaborationIntentDecisionV20261 = {
    schemaVersion: '2026.1',
    traceId: 'tr-1',
    roomId: 'r1',
    intentType: 'audience_resolution',
    confidence: 0.88,

    explanation: 'test',
    routingHints: {
      riskLevel: 'low',
      requiresParallelism: false,
      shouldExecute: false,
      suggestedDepartmentSlugs: [],
    },
  };

  function minimalDecision(brief?: string): CeoDecisionResult {
    return {
      nextStep: NextStep.QUICK_REPLY,
      confidence: 0.5,
      commitmentText: 'ok',
      l1DecisionContext: {
        classifierContextBrief: brief,
      } as any,
    };
  }

  it('appends unified summary when intentDecision2026_1 is present', () => {
    const svc = new L1PostNormalizerService();
    const input = CeoDecisionInputBridge.withUnified(baseInput, unified);
    const out = svc.normalize(minimalDecision('prev'), input);
    expect(out.l1DecisionContext.classifierContextBrief).toContain('prev');
    expect(out.l1DecisionContext.classifierContextBrief).toContain('[2026.1 unified intent]');
    expect(out.l1DecisionContext.classifierContextBrief).toContain('traceId=tr-1');

  });

  it('returns decision unchanged for legacy input', () => {
    const svc = new L1PostNormalizerService();
    const decision = minimalDecision('only');
    const legacy = { ...baseInput, intentContract: 'legacy_intent_v1' as const };
    const out = svc.normalize(decision, legacy);
    expect(out).toBe(decision);
  });
});
