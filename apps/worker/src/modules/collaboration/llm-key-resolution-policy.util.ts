/**
 * 结构化 LLM 密钥解析策略 ID（不含密钥值），用于日志与 `llm_key_resolution_policy_total`。
 */
export function buildLlmKeyResolutionPolicyId(params: {
  routerRole: string;
  /** CEO 路径下忽略 agent 绑定 fixed key */
  ignoredAgentFixedKeyForCeo: boolean;
  /** 非 CEO（或 CEO 未忽略时）是否使用 agent fixed key 参与解析 */
  usingAgentFixedKey: boolean;
  /** 是否在解析前注入了 CEO layer dedicated / keyIds */
  ceoLayerKeyInjected: boolean;
  /** `agents.llmKeyPoolCandidates` 合并 layer 后的候选数 */
  candidatePoolSize: number;
}): { policyId: string; summary: string } {
  if (params.ignoredAgentFixedKeyForCeo) {
    return {
      policyId: 'ceo_ignores_agent_fixed_key',
      summary: 'CEO route prefers layer key pool; agent llmKeyId not used for routing',
    };
  }
  if (params.usingAgentFixedKey) {
    return {
      policyId: 'agent_fixed_key',
      summary: 'Member route may use agent-bound fixed LLM key in prep cache key',
    };
  }
  if (params.ceoLayerKeyInjected) {
    return {
      policyId: 'ceo_layer_key_injection',
      summary: 'CEO layer dedicated or keyIds merged into candidate pool',
    };
  }
  if (params.candidatePoolSize > 0) {
    return {
      policyId: 'company_pool_candidates',
      summary: 'Tenant candidate pool non-empty before resolver',
    };
  }
  return {
    policyId: 'resolver_global_or_empty_pool',
    summary: 'No local candidates or empty pool; resolver may use global path',
  };
}
