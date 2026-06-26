import type { IntentDecision } from '@contracts/types';
import { decideCeoV2HeavyTemporalPreference } from './ceo-v2-heavy-temporal-decision.util.js';

function intent(t: IntentDecision['intentType'], exec = false, parallel = false): IntentDecision {
  return {
    schemaVersion: '1.0',
    intentType: t,

    confidence: 0.9,
    explanation: 'x',
    traceId: 't',
    roomId: 'r',
    requestedBy: 'u',
    routingHints: { requiresParallelism: parallel, riskLevel: 'low' },
    shouldExecute: exec,
  } as IntentDecision;
}

describe('decideCeoV2HeavyTemporalPreference', () => {
  it('returns false when worker disabled', () => {
    const d = decideCeoV2HeavyTemporalPreference({
      intentDecision: intent('orchestration', true, true),
      temporalWorkerEnabled: false,
      companyInTemporalAllowlist: false,
      rolloutPercent: 100,
      rolloutBucket: 0,
      heavyDefaultTemporal: true,
    });
    expect(d.preferTemporal).toBe(false);
    expect(d.reason).toBe('temporal_worker_disabled');
  });

  it('allowlist wins', () => {
    const d = decideCeoV2HeavyTemporalPreference({
      intentDecision: intent('orchestration', true, true),
      temporalWorkerEnabled: true,
      companyInTemporalAllowlist: true,
      rolloutPercent: 0,
      rolloutBucket: 99,
      heavyDefaultTemporal: false,
    });
    expect(d.preferTemporal).toBe(true);
    expect(d.reason).toBe('company_allowlist');
  });

  it('heavy default temporal when rollout off', () => {
    const d = decideCeoV2HeavyTemporalPreference({
      intentDecision: intent('orchestration', true, true),
      temporalWorkerEnabled: true,
      companyInTemporalAllowlist: false,
      rolloutPercent: 0,
      rolloutBucket: 50,
      heavyDefaultTemporal: true,
    });
    expect(d.preferTemporal).toBe(true);
    expect(d.reason).toBe('heavy_default_temporal');
  });
});
