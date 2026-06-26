import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import {
  CeoDecisionInputBridge,
  type CeoDecisionInput,
} from '../ceo/dto/ceo-v2-pipeline.types.js';
import { L1ClassifierCoreService } from './l1-classifier-core.service.js';

describe('L1ClassifierCoreService', () => {
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
    traceId: 't-unified',
    roomId: 'r1',
    intentType: 'audience_resolution',
    confidence: 0.9,

    explanation: 'test',
    routingHints: {
      riskLevel: 'low',
      requiresParallelism: false,
      shouldExecute: true,
      suggestedDepartmentSlugs: [],
    },
  };

  it('delegates to PreContextService and attaches unified when present', async () => {
    const pre = {
      cacheKey: 'k',
      humanIdentityDigest: 'hid',
      transcriptSummary: 'ts',
      vectorEvidence: 've',
      decisionFingerprint: 'fp',
    };
    const preContext = {
      buildClassifierContext: jest.fn(async () => pre),
    } as any;
    const svc = new L1ClassifierCoreService(preContext);
    const input = CeoDecisionInputBridge.withUnified(baseInput, unified);
    const out = await svc.classifyCore(input);
    expect(preContext.buildClassifierContext).toHaveBeenCalledWith(input);
    expect(out).toEqual({ ...pre, intentDecision2026_1: unified });
  });

  it('omits intentDecision2026_1 for legacy-only input', async () => {
    const pre = {
      cacheKey: 'k2',
      humanIdentityDigest: '',
      transcriptSummary: '',
      vectorEvidence: '',
      decisionFingerprint: 'fp2',
    };
    const preContext = {
      buildClassifierContext: jest.fn(async () => pre),
    } as any;
    const svc = new L1ClassifierCoreService(preContext);
    const legacy = { ...baseInput, intentContract: 'legacy_intent_v1' as const };
    const out = await svc.classifyCore(legacy);
    expect(out.intentDecision2026_1).toBeUndefined();
  });
});
