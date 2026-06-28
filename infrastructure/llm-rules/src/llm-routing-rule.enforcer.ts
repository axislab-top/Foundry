import { chatModelSchema, isEmbeddingLikeByPatterns } from './model-type.schema.js';

export type ModelRulePhase =
  | 'llmKeys.acquire'
  | 'llmKeys.acquireById'
  | 'decision_resolver'
  | 'layer_resolver'
  | 'bridge_router'
  | 'classifier';

export class LLMRoutingRuleEnforcer {
  enforceChatRequired(params: {
    modelOrKey: string | null | undefined;
    companyId?: string;
    phase: ModelRulePhase;
    configSource: string;
    patterns: readonly string[];
  }): void {
    chatModelSchema.parse(String(params.modelOrKey ?? ''));
    if (!isEmbeddingLikeByPatterns(params.modelOrKey, params.patterns)) return;
    const msg = `rule_violation:model_type_pollution_prevented,phase=${params.phase},configSource=${params.configSource}`;
    throw new Error(
      JSON.stringify({
        code: 'MODEL_TYPE_RULE_VIOLATION',
        message: msg,
        details: {
          ruleViolated: 'chat-required',
          companyId: params.companyId ?? null,
          phase: params.phase,
          configSource: params.configSource,
          modelOrKey: params.modelOrKey ?? null,
        },
      }),
    );
  }
}

