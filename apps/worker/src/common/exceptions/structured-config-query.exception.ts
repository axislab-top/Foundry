import { DomainException } from '../../modules/autonomous/errors/domain.exception.js';

export class StructuredConfigQueryException extends DomainException {
  constructor(params: {
    phase: string;
    companyId: string;
    requestedKey: string;
    originalError: string;
  }) {
    super({
      code: 'CONFIG_QUERY_STRUCTURED',
      message: `config_query_structured: phase=${params.phase} companyId=${params.companyId} requestedKey=${params.requestedKey}`,
      details: {
        phase: params.phase,
        companyId: params.companyId,
        requestedKey: params.requestedKey,
        originalError: params.originalError,
      },
    });
  }
}

export class StructuredLLMRoutingException extends DomainException {
  constructor(params: {
    ruleViolated: 'chat-required';
    configSource: string;
    companyId?: string | null;
    phase: string;
    modelOrKey: string;
  }) {
    super({
      code: 'LLM_ROUTING_RULE_VIOLATION',
      message: `rule_violation:model_type_pollution_prevented,phase=${params.phase}`,
      details: params,
    });
  }
}

