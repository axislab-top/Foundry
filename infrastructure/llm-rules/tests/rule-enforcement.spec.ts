import { LLMRoutingRuleEnforcer } from '../src/llm-routing-rule.enforcer.js';
import { chatModelSchema, embeddingModelSchema } from '../src/model-type.schema.js';

describe('LLMRoutingRuleEnforcer', () => {
  it('rejects embedding model in chat-required phase', () => {
    const enforcer = new LLMRoutingRuleEnforcer();
    expect(() =>
      enforcer.enforceChatRequired({
        modelOrKey: 'Qwen3-Embedding-8B',
        companyId: 'c1',
        phase: 'classifier',
        configSource: 'ceoLayerConfig',
        patterns: ['embedding'],
      }),
    ).toThrow(/MODEL_TYPE_RULE_VIOLATION/);
  });

  it('allows chat model in chat-required phase', () => {
    const enforcer = new LLMRoutingRuleEnforcer();
    expect(() =>
      enforcer.enforceChatRequired({
        modelOrKey: 'Qwen3-235B-A22B',
        companyId: 'c1',
        phase: 'classifier',
        configSource: 'ceoLayerConfig',
        patterns: ['embedding'],
      }),
    ).not.toThrow();
  });

  it('validates branded zod schemas', () => {
    expect(() => chatModelSchema.parse('Qwen3-235B-A22B')).not.toThrow();
    expect(() => embeddingModelSchema.parse('Qwen3-Embedding-8B')).not.toThrow();
  });
});

