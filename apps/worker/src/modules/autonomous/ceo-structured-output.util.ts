/** OpenAI json_mode / json_object 要求 prompt 含 "json" 字样。 */
export function ensureJsonKeywordForStructuredOutput(prompt: string): string {
  const p = String(prompt ?? '').trim();
  if (!p) {
    return 'Respond with valid JSON only.';
  }
  if (/json/i.test(p)) return p;
  return `${p}\n\nRespond with valid JSON only (json_object format).`;
}

export function isJsonObjectPromptFormatError(message: string): boolean {
  const m = String(message ?? '').toLowerCase();
  return m.includes("prompt must contain the word 'json'") || m.includes('response_format');
}

/**
 * LangChain 对「非 gpt-3 / 非 gpt-4-* / 非 gpt-4」模型名默认走 response_format=json_schema。
 * 智谱 GLM、DeepSeek 等 OpenAI 兼容网关往往不支持或长时间挂起，应使用 json_mode。
 */
export function structuredOutputMethodForCeoPlan(modelName: string): 'jsonSchema' | 'jsonMode' {
  const m = (modelName || '').trim().toLowerCase();
  if (
    m.includes('glm-') ||
    m.includes('deepseek') ||
    m.includes('qwen') ||
    m.includes('doubao') ||
    m.includes('moonshot') ||
    m.includes('kimi') ||
    m.includes('ernie') ||
    m.includes('hunyuan')
  ) {
    return 'jsonMode';
  }
  if (m.includes('gpt-4o') || m.includes('gpt-5') || /^o[0-9]/.test(m)) {
    return 'jsonSchema';
  }
  return 'jsonMode';
}

export function readBreakdownContextFromState(hierarchicalMetaJson: string | undefined): Record<string, unknown> {
  try {
    const hm = JSON.parse(String(hierarchicalMetaJson ?? '{}')) as {
      breakdownContext?: Record<string, unknown>;
    };
    return hm.breakdownContext && typeof hm.breakdownContext === 'object' ? hm.breakdownContext : {};
  } catch {
    return {};
  }
}
