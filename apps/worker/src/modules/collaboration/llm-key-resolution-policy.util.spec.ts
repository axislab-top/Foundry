import { buildLlmKeyResolutionPolicyId } from './llm-key-resolution-policy.util.js';

describe('buildLlmKeyResolutionPolicyId', () => {
  it('prefers ceo ignore agent fixed key', () => {
    const r = buildLlmKeyResolutionPolicyId({
      routerRole: 'ceo',
      ignoredAgentFixedKeyForCeo: true,
      usingAgentFixedKey: false,
      ceoLayerKeyInjected: true,
      candidatePoolSize: 3,
    });
    expect(r.policyId).toBe('ceo_ignores_agent_fixed_key');
  });

  it('uses agent_fixed_key when member uses fixed key', () => {
    const r = buildLlmKeyResolutionPolicyId({
      routerRole: 'member',
      ignoredAgentFixedKeyForCeo: false,
      usingAgentFixedKey: true,
      ceoLayerKeyInjected: false,
      candidatePoolSize: 0,
    });
    expect(r.policyId).toBe('agent_fixed_key');
  });
});
