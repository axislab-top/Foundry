import {
  coerceIntentRuleTypeTo2026,
  isNaturalConversationIntentType,
} from '@contracts/types';
import {
  audienceRoutingLlmSchema,
  coerceIntentTypeFromLlm,
  INTENT_TYPE_CANONICAL,
  scrubAudienceRoutingLlmPayload,
} from './collaboration-2026.contracts.js';

describe('scrubAudienceRoutingLlmPayload + audienceRoutingLlmSchema', () => {
  it('unwraps nested output envelope and lifts routingHints.targetAgentIds', () => {
    const raw = {
      output: {
        confidence: 0.82,
        explanation: 'nested envelope',
        routingHints: { targetAgentIds: ['agent-a', 'agent-b'] },
      },
    };
    const parsed = audienceRoutingLlmSchema.parse(scrubAudienceRoutingLlmPayload(raw));
    expect(parsed.targetAgentIds).toEqual(['agent-a', 'agent-b']);
  });

  it('legacy envelope keys are dropped by scrub; schema parses confidence + explanation', () => {
    const parsed = audienceRoutingLlmSchema.parse(
      scrubAudienceRoutingLlmPayload({
        intentType: 'audience_resolution',
        confidence: 0.91,
        explanation: 'legacy envelope',

      }),
    );
    expect(parsed.confidence).toBeCloseTo(0.91);
    expect(parsed.explanation).toBe('legacy envelope');
  });

  it('defaults confidence and explanation when omitted (ids-only shape)', () => {
    const parsed = audienceRoutingLlmSchema.parse(scrubAudienceRoutingLlmPayload({ targetAgentIds: [] }));
    expect(parsed.confidence).toBeCloseTo(0.88);
    expect(parsed.explanation).toBe('audience_routing_llm');
    expect(parsed.targetAgentIds).toBeUndefined();
  });

  it('parses empty object to defaults', () => {
    const parsed = audienceRoutingLlmSchema.parse(scrubAudienceRoutingLlmPayload({}));
    expect(parsed.confidence).toBeCloseTo(0.88);
    expect(parsed.explanation).toBe('audience_routing_llm');
  });

  it('strips userFacingReply from raw model payload (routing LLM must not emit copy)', () => {
    const parsed = audienceRoutingLlmSchema.parse(
      scrubAudienceRoutingLlmPayload({
        targetAgentIds: ['a'],
        userFacingReply: { text: 'must not appear' },
      }),
    );
    expect(parsed.targetAgentIds).toEqual(['a']);
    expect(parsed).not.toHaveProperty('userFacingReply');
  });
});

describe('coerceIntentRuleTypeTo2026 (@contracts)', () => {
  it('maps legacy rule studio tokens', () => {
    expect(coerceIntentRuleTypeTo2026('heavy')).toBe('orchestration');
    expect(coerceIntentRuleTypeTo2026('quick')).toBe('ceo_reply');
  });

  it('natural conversation only for ceo_reply lineage', () => {
    expect(isNaturalConversationIntentType('ceo_reply')).toBe(true);
    expect(isNaturalConversationIntentType('simple_query')).toBe(true);
    expect(isNaturalConversationIntentType('audience_resolution')).toBe(false);
  });
});

describe('coerceIntentTypeFromLlm', () => {
  it('maps any recognized legacy token to audience_resolution', () => {
    expect(coerceIntentTypeFromLlm('simple_query')).toBe('audience_resolution');
    expect(coerceIntentTypeFromLlm('direct_summon')).toBe('audience_resolution');
    expect(coerceIntentTypeFromLlm('ceo_reply')).toBe('audience_resolution');
    expect(coerceIntentTypeFromLlm('strategy')).toBe('audience_resolution');
    expect(coerceIntentTypeFromLlm('approval')).toBe('audience_resolution');
  });

  it('accepts canonical tokens', () => {
    for (const t of INTENT_TYPE_CANONICAL) {
      expect(coerceIntentTypeFromLlm(t)).toBe(t);
    }
  });

  it('maps unknown garbage to audience_resolution (catch-all for legacy tokens)', () => {
    expect(coerceIntentTypeFromLlm('not_a_real_intent_xyz')).toBe('audience_resolution');
    expect(coerceIntentTypeFromLlm('')).toBe('unknown');
    expect(coerceIntentTypeFromLlm(null)).toBe('unknown');
  });
});
