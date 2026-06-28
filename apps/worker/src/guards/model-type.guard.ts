import { Injectable } from '@nestjs/common';
import { LLMRoutingRuleEnforcer } from '../common/llm-rules/llm-routing-rule.enforcer.js';
import { EMBEDDING_MODEL_PATTERNS } from '../config/llm.config.js';
import { StructuredLLMRoutingException } from '../common/exceptions/structured-config-query.exception.js';

@Injectable()
export class ModelTypeGuard {
  constructor(private readonly enforcer: LLMRoutingRuleEnforcer) {}

  requireChat(params: {
    modelOrKey: string;
    companyId?: string;
    phase: 'decision_resolver' | 'layer_resolver' | 'bridge_router' | 'classifier';
    configSource: string;
  }): void {
    try {
      this.enforcer.enforceChatRequired({
        modelOrKey: params.modelOrKey,
        companyId: params.companyId,
        phase: params.phase,
        configSource: params.configSource,
        patterns: EMBEDDING_MODEL_PATTERNS,
      });
    } catch {
      throw new StructuredLLMRoutingException({
        ruleViolated: 'chat-required',
        configSource: params.configSource,
        companyId: params.companyId,
        phase: params.phase,
        modelOrKey: params.modelOrKey,
      });
    }
  }
}

