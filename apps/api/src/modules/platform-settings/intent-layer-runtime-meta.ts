/** Worker 主群受众路由实际消费的 globalSettings 字段（经 CEO layer 下发）。 */
export const INTENT_LAYER_GLOBAL_SETTINGS_EFFECTIVE_FIELDS = [
  'model',
  'modelKeyId',
  'fallbackModel',
  'fallbackModelKeyId',
  'maxRetries',
  'temperature',
  'llmTimeoutMs',
] as const;

/** 仅存盘/兼容，Worker 不读取。 */
export const INTENT_LAYER_GLOBAL_SETTINGS_ARCHIVAL_FIELDS = [
  'llmEnabled',
  'ruleConfidenceThreshold',
  'memoryInfluenceWeight',
  'ruleSetVersion',
  'enableAdvancedPatterns',
  'keywordBoost',
  'fastPathThreshold',
  'approvalThreshold',
  'enableDirectAgentRouting',
  'enableMultiAgentRouting',
  'enableOrgNodeRouting',
  'enableBroadcastRouting',
  'allowCeoFallbackWhenTargetMissing',
] as const;

export type IntentLayerRuntimeEffect = 'none' | 'partial';

export type IntentLayerGlobalSettingsEnvelope = {
  runtimeEffect: 'partial';
  runtimeNotes: string;
  effectiveFields: readonly string[];
  archivalFields: readonly string[];
  settings: Record<string, unknown>;
};

export type IntentLayerRulesEnvelope = {
  runtimeEffect: 'none';
  runtimeNotes: string;
  rules: Record<string, unknown>[];
};

export function wrapIntentLayerGlobalSettings(
  settings: Record<string, unknown>,
): IntentLayerGlobalSettingsEnvelope {
  return {
    runtimeEffect: 'partial',
    runtimeNotes:
      'Worker 主群受众路由读取下发的 modelName/modelKeyId（由 model/modelKeyId 映射）及 globalSettings 中的 temperature/maxRetries/llmTimeoutMs；其余字段仅存盘，不参与线上路由。',
    effectiveFields: [...INTENT_LAYER_GLOBAL_SETTINGS_EFFECTIVE_FIELDS],
    archivalFields: [...INTENT_LAYER_GLOBAL_SETTINGS_ARCHIVAL_FIELDS],
    settings,
  };
}

export function wrapIntentLayerRules(rules: Record<string, unknown>[]): IntentLayerRulesEnvelope {
  return {
    runtimeEffect: 'none',
    runtimeNotes:
      'Rule Studio 规则仅作历史归档；Worker recognizeIntent 不读取 collab.intentLayer.rules。',
    rules,
  };
}
