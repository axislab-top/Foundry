export function planningStructuredOutputMethod(modelName: string): 'jsonSchema' | 'jsonMode' {
  const m = (modelName || '').trim().toLowerCase();
  if (
    m.includes('glm-') ||
    m.includes('deepseek') ||
    m.includes('qwen') ||
    m.includes('doubao') ||
    m.includes('moonshot') ||
    m.includes('kimi') ||
    m.includes('ernie') ||
    m.includes('hunyuan') ||
    m.includes('mimo')
  ) {
    return 'jsonMode';
  }
  // `gpt-4o-mini` / `gpt-4o-nano` contain the substring `gpt-4o` but strict `json_schema` is flaky
  // on those endpoints; prefer `json_mode` + Zod/repair like other compact OpenAI models.
  if (
    m.includes('gpt-4o-mini') ||
    m.includes('gpt-4o-nano') ||
    m.includes('gpt-5-mini') ||
    m.includes('gpt-5-nano')
  ) {
    return 'jsonMode';
  }
  if (m.includes('gpt-4o') || m.includes('gpt-5') || /^o[0-9]/.test(m)) {
    return 'jsonSchema';
  }
  return 'jsonMode';
}

/** LangChain `withStructuredOutput` options for the contract-only channel (strict when json_schema). */
export function contractStructuredOutputInvokeOptions(method: 'jsonSchema' | 'jsonMode'): {
  method: 'jsonSchema' | 'jsonMode';
  strict?: boolean;
  name: string;
} {
  if (method === 'jsonSchema') {
    return { method: 'jsonSchema', strict: true, name: 'ceo_v2_planning_contract' };
  }
  return { method: 'jsonMode', name: 'ceo_v2_planning_contract' };
}

/**
 * Strategy L1 planning uses LangChain `withStructuredOutput` with either native `json_schema`
 * (OpenAI o-series / gpt-4o+ where supported) or `json_mode` for OpenAI-compatible providers.
 * Admin-configured strategy models (GLM、DeepSeek、Mimo 等) must not be rejected here — capability
 * is enforced at invoke + Zod validation + bounded contract-channel repair.
 */
export function isPlanningModelCapabilityAccepted(modelName: string): boolean {
  const m = (modelName || '').trim();
  if (!m) return false;
  const method = planningStructuredOutputMethod(m);
  return method === 'jsonSchema' || method === 'jsonMode';
}
