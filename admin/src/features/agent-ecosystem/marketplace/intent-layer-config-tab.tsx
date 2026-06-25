import { useEffect, useState, type ReactElement } from 'react';
import { Alert, Button, Card, Input, InputNumber, Select, Space, Spin, Tabs, message } from 'antd';
import {
  coerceIntentRuleTypeTo2026,
  type CollaborationIntentType2026,
} from '@contracts/types';
import { adminAuthedRequestJson } from '../../../shared/api/client';

type IntentGlobalFormState = {
  llmEnabled: boolean;
  ruleConfidenceThreshold: number;
  llmTimeoutMs: number;
  memoryInfluenceWeight: number;
  model: string;
  modelKeyId: string | null;
  fallbackModel: string;
  fallbackModelKeyId: string | null;
  maxRetries: number;
  temperature: number;
  ruleSetVersion: string;
  enableAdvancedPatterns: boolean;
  keywordBoost: number;
  fastPathThreshold: number;
  approvalThreshold: number;
  enableDirectAgentRouting: boolean;
  enableMultiAgentRouting: boolean;
  enableOrgNodeRouting: boolean;
  enableBroadcastRouting: boolean;
  allowCeoFallbackWhenTargetMissing: boolean;
};

type IntentRuleIntentType = CollaborationIntentType2026;

const normalizeIntentRule = (rule: IntentRule): IntentRule => ({
  ...rule,
  intentType: coerceIntentRuleTypeTo2026(rule.intentType),
});

type IntentRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  intentType: IntentRuleIntentType;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  conditions?: {
    keywords?: string[];
    regex?: string;
    requiresMention?: boolean;
    minLength?: number;
    maxLength?: number;
  };
};

type IntentDebuggerFormState = {
  text: string;
  companyId: string;
  roomId: string;
  messageId: string;
  mentionedAgentIdsText: string;
  mentionedNodeIdsText: string;
  roomAgentIdsText: string;
  roomOrgNodeIdsText: string;
  ceoAgentId: string;
  messageCategory: '' | 'chat' | 'task_publish' | 'report' | 'approval' | 'coordination' | 'broadcast';
};

const DEFAULT_INTENT_GLOBAL_FORM: IntentGlobalFormState = {
  llmEnabled: false,
  ruleConfidenceThreshold: 0.8,
  llmTimeoutMs: 1500,
  memoryInfluenceWeight: 0.25,
  model: 'gpt-4o-mini',
  modelKeyId: null,
  fallbackModel: 'gpt-4o-mini',
  fallbackModelKeyId: null,
  maxRetries: 2,
  temperature: 0.3,
  ruleSetVersion: 'v1.0',
  enableAdvancedPatterns: true,
  keywordBoost: 0.4,
  fastPathThreshold: 0.85,
  approvalThreshold: 0.84,
  enableDirectAgentRouting: true,
  enableMultiAgentRouting: true,
  enableOrgNodeRouting: true,
  enableBroadcastRouting: true,
  allowCeoFallbackWhenTargetMissing: true,
};

const toErrorText = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

type IntentLayerGlobalSettingsApiResponse = {
  runtimeEffect?: string;
  runtimeNotes?: string;
  effectiveFields?: string[];
  archivalFields?: string[];
  settings?: Record<string, unknown>;
} & Record<string, unknown>;

function unwrapIntentLayerGlobalSettings(payload: IntentLayerGlobalSettingsApiResponse): Record<string, unknown> {
  if (payload.settings && typeof payload.settings === 'object' && !Array.isArray(payload.settings)) {
    return payload.settings;
  }
  return payload;
}

type IntentLayerRulesApiResponse = {
  runtimeEffect?: string;
  runtimeNotes?: string;
  rules?: IntentRule[];
};

function unwrapIntentLayerRules(payload: IntentLayerRulesApiResponse): {
  runtimeEffect: string | null;
  runtimeNotes: string | null;
  rules: IntentRule[];
} {
  const rules = (payload.rules ?? []).map((rule) => normalizeIntentRule(rule as IntentRule));
  return {
    runtimeEffect: typeof payload.runtimeEffect === 'string' ? payload.runtimeEffect : null,
    runtimeNotes: typeof payload.runtimeNotes === 'string' ? payload.runtimeNotes : null,
    rules,
  };
}

const normalizeIntentGlobalForm = (config: Record<string, unknown> | null): IntentGlobalFormState => {
  const classifier = (config?.classifier ?? {}) as Record<string, unknown>;
  const contextPolicy = (classifier.contextPolicy ?? {}) as Record<string, unknown>;
  const intentLayer = (contextPolicy.intentLayer ?? {}) as Record<string, unknown>;
  const global = (intentLayer.globalSettings ?? {}) as Record<string, unknown>;
  return {
    llmEnabled: typeof global.llmEnabled === 'boolean' ? global.llmEnabled : DEFAULT_INTENT_GLOBAL_FORM.llmEnabled,
    ruleConfidenceThreshold:
      typeof global.ruleConfidenceThreshold === 'number'
        ? global.ruleConfidenceThreshold
        : DEFAULT_INTENT_GLOBAL_FORM.ruleConfidenceThreshold,
    llmTimeoutMs: typeof global.llmTimeoutMs === 'number' ? global.llmTimeoutMs : DEFAULT_INTENT_GLOBAL_FORM.llmTimeoutMs,
    memoryInfluenceWeight:
      typeof global.memoryInfluenceWeight === 'number'
        ? global.memoryInfluenceWeight
        : DEFAULT_INTENT_GLOBAL_FORM.memoryInfluenceWeight,
    model: typeof global.model === 'string' ? global.model : DEFAULT_INTENT_GLOBAL_FORM.model,
    modelKeyId: typeof global.modelKeyId === 'string' && global.modelKeyId.trim() ? global.modelKeyId.trim() : null,
    fallbackModel:
      typeof global.fallbackModel === 'string' ? global.fallbackModel : DEFAULT_INTENT_GLOBAL_FORM.fallbackModel,
    fallbackModelKeyId:
      typeof global.fallbackModelKeyId === 'string' && global.fallbackModelKeyId.trim()
        ? global.fallbackModelKeyId.trim()
        : null,
    maxRetries: typeof global.maxRetries === 'number' ? global.maxRetries : DEFAULT_INTENT_GLOBAL_FORM.maxRetries,
    temperature: typeof global.temperature === 'number' ? global.temperature : DEFAULT_INTENT_GLOBAL_FORM.temperature,
    ruleSetVersion: typeof global.ruleSetVersion === 'string' ? global.ruleSetVersion : DEFAULT_INTENT_GLOBAL_FORM.ruleSetVersion,
    enableAdvancedPatterns:
      typeof global.enableAdvancedPatterns === 'boolean'
        ? global.enableAdvancedPatterns
        : DEFAULT_INTENT_GLOBAL_FORM.enableAdvancedPatterns,
    keywordBoost: typeof global.keywordBoost === 'number' ? global.keywordBoost : DEFAULT_INTENT_GLOBAL_FORM.keywordBoost,
    fastPathThreshold:
      typeof global.fastPathThreshold === 'number'
        ? global.fastPathThreshold
        : DEFAULT_INTENT_GLOBAL_FORM.fastPathThreshold,
    approvalThreshold:
      typeof global.approvalThreshold === 'number'
        ? global.approvalThreshold
        : DEFAULT_INTENT_GLOBAL_FORM.approvalThreshold,
    enableDirectAgentRouting:
      typeof global.enableDirectAgentRouting === 'boolean'
        ? global.enableDirectAgentRouting
        : DEFAULT_INTENT_GLOBAL_FORM.enableDirectAgentRouting,
    enableMultiAgentRouting:
      typeof global.enableMultiAgentRouting === 'boolean'
        ? global.enableMultiAgentRouting
        : DEFAULT_INTENT_GLOBAL_FORM.enableMultiAgentRouting,
    enableOrgNodeRouting:
      typeof global.enableOrgNodeRouting === 'boolean'
        ? global.enableOrgNodeRouting
        : DEFAULT_INTENT_GLOBAL_FORM.enableOrgNodeRouting,
    enableBroadcastRouting:
      typeof global.enableBroadcastRouting === 'boolean'
        ? global.enableBroadcastRouting
        : DEFAULT_INTENT_GLOBAL_FORM.enableBroadcastRouting,
    allowCeoFallbackWhenTargetMissing:
      typeof global.allowCeoFallbackWhenTargetMissing === 'boolean'
        ? global.allowCeoFallbackWhenTargetMissing
        : DEFAULT_INTENT_GLOBAL_FORM.allowCeoFallbackWhenTargetMissing,
  };
};

/** 保存时原样写回的历史字段（UI 已隐藏，Worker 不消费）。 */
function buildIntentGlobalSettingsSaveBody(form: IntentGlobalFormState): Record<string, unknown> {
  return {
    llmEnabled: form.llmEnabled,
    ruleConfidenceThreshold: form.ruleConfidenceThreshold,
    llmTimeoutMs: form.llmTimeoutMs,
    memoryInfluenceWeight: form.memoryInfluenceWeight,
    model: form.model,
    modelKeyId: form.modelKeyId,
    fallbackModel: form.fallbackModel,
    fallbackModelKeyId: form.fallbackModelKeyId,
    maxRetries: form.maxRetries,
    temperature: form.temperature,
    ruleSetVersion: form.ruleSetVersion,
    enableAdvancedPatterns: form.enableAdvancedPatterns,
    keywordBoost: form.keywordBoost,
    fastPathThreshold: form.fastPathThreshold,
    approvalThreshold: form.approvalThreshold,
    enableDirectAgentRouting: form.enableDirectAgentRouting,
    enableMultiAgentRouting: form.enableMultiAgentRouting,
    enableOrgNodeRouting: form.enableOrgNodeRouting,
    enableBroadcastRouting: form.enableBroadcastRouting,
    allowCeoFallbackWhenTargetMissing: form.allowCeoFallbackWhenTargetMissing,
  };
}

function isWorkerIntentDecisionPayload(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.intentType === 'string' && o.routingHints !== undefined && typeof o.traceId === 'string';
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return adminAuthedRequestJson<T>(url, init);
}

function parseIdList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

type IntentGlobalSettingsTabProps = {
  form: IntentGlobalFormState;
  chatModels: Array<{ label: string; value: string }>;
  modelKeys: Array<{ id: string; alias: string }>;
  fallbackModelKeys: Array<{ id: string; alias: string }>;
  modelAssetsLoading: boolean;
  onChange: (patch: Partial<IntentGlobalFormState>) => void;
  onRefreshModelAssets: () => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
};

function IntentGlobalSettingsTab({
  form,
  chatModels,
  modelKeys,
  fallbackModelKeys,
  modelAssetsLoading,
  onChange,
  onRefreshModelAssets,
  onReset,
  onSave,
  saving
}: IntentGlobalSettingsTabProps): ReactElement {
  return (
    <div className="erp-ceo-tab-content">
      <Alert
        type="info"
        showIcon
        title="线上生效项"
        description="Worker 主群受众路由仅读取下发后的 modelName / modelKeyId（及 intent 层 temperature 等 CEO 配置）。下方「LLM 模型配置」为唯一需要维护的项；历史规则/路由开关仍随保存原样写回 platform_settings，但 Worker 不消费。"
        style={{ marginBottom: 16 }}
      />

      <Card variant="borderless" className="erp-market-table-card">
        <div className="erp-ceo-section-title">LLM 模型配置（受众路由）</div>
        <div className="erp-intent-actions" style={{ marginBottom: 12 }}>
          <Button onClick={onRefreshModelAssets} loading={modelAssetsLoading}>
            刷新模型/Key池
          </Button>
        </div>
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <div className="erp-intent-field-label">COLLAB_INTENT_MODEL</div>
            <Select
              style={{ width: '100%' }}
              value={form.model}
              loading={modelAssetsLoading}
              onChange={(value) => onChange({ model: value, modelKeyId: null })}
              options={chatModels}
            />
            <div className="erp-market-agent-meta">主群接话人识别（IntentLayerService.recognizeIntent）</div>
          </div>
          <div>
            <div className="erp-intent-field-label">COLLAB_INTENT_MODEL_KEY_ID</div>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder={form.model ? '选择该模型可用 Key（可选）' : '请先选择模型'}
              value={form.modelKeyId ?? undefined}
              loading={modelAssetsLoading}
              onChange={(value) => onChange({ modelKeyId: value ?? null })}
              options={modelKeys.map((key) => ({
                label: `${key.alias} (${key.id.slice(0, 8)})`,
                value: key.id,
              }))}
            />
          </div>
          <div>
            <div className="erp-intent-field-label">COLLAB_INTENT_FALLBACK_MODEL</div>
            <Select
              style={{ width: '100%' }}
              value={form.fallbackModel}
              loading={modelAssetsLoading}
              onChange={(value) => onChange({ fallbackModel: value, fallbackModelKeyId: null })}
              options={chatModels}
            />
          </div>
          <div>
            <div className="erp-intent-field-label">COLLAB_INTENT_FALLBACK_MODEL_KEY_ID</div>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder={form.fallbackModel ? '选择 fallback 模型可用 Key（可选）' : '请先选择 fallback 模型'}
              value={form.fallbackModelKeyId ?? undefined}
              loading={modelAssetsLoading}
              onChange={(value) => onChange({ fallbackModelKeyId: value ?? null })}
              options={fallbackModelKeys.map((key) => ({
                label: `${key.alias} (${key.id.slice(0, 8)})`,
                value: key.id,
              }))}
            />
          </div>
          <div className="erp-intent-inline-fields">
            <div>
              <div className="erp-intent-field-label">COLLAB_INTENT_MAX_RETRIES</div>
              <InputNumber
                min={0}
                max={5}
                value={form.maxRetries}
                onChange={(value) => onChange({ maxRetries: Number(value ?? DEFAULT_INTENT_GLOBAL_FORM.maxRetries) })}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <div className="erp-intent-field-label">COLLAB_INTENT_TEMPERATURE</div>
              <InputNumber
                min={0}
                max={1}
                step={0.1}
                value={form.temperature}
                onChange={(value) => onChange({ temperature: Number(value ?? DEFAULT_INTENT_GLOBAL_FORM.temperature) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </Space>
      </Card>

      <div className="erp-intent-actions">
        <Button onClick={onReset} disabled={saving}>
          重置默认
        </Button>
        <Button type="primary" onClick={onSave} loading={saving}>
          保存全局配置
        </Button>
      </div>
    </div>
  );
}

function IntentPerCompanyTab(): ReactElement {
  return (
    <div className="erp-ceo-tab-content">
      <Card variant="borderless" className="erp-market-table-card">
        <div className="erp-ceo-section-title">公司配置页（Per Company）</div>
        <div className="erp-market-agent-meta">搜索公司并覆盖全局配置</div>
        <div className="erp-intent-company-toolbar">
          <Input placeholder="搜索公司名称 / Company ID" />
          <Select
            defaultValue="inherit"
            style={{ width: 220 }}
            options={[
              { label: '继承全局配置', value: 'inherit' },
              { label: '仅覆盖阈值', value: 'threshold-only' },
              { label: '完全覆盖', value: 'override-all' }
            ]}
          />
          <Button type="primary">加载公司配置</Button>
        </div>
      </Card>
    </div>
  );
}

function IntentRuleArchiveTab(): ReactElement {
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [runtimeEffect, setRuntimeEffect] = useState<string | null>(null);
  const [runtimeNotes, setRuntimeNotes] = useState<string | null>(null);
  const [rules, setRules] = useState<IntentRule[]>([]);

  const loadRules = async (): Promise<void> => {
    setBusy(true);
    setLastError(null);
    try {
      const payload = await requestJson<IntentLayerRulesApiResponse>(
        '/api/v1/admin/platform-settings/intent-layer-rules',
      );
      const unwrapped = unwrapIntentLayerRules(payload);
      setRules(unwrapped.rules);
      setRuntimeEffect(unwrapped.runtimeEffect);
      setRuntimeNotes(unwrapped.runtimeNotes);
    } catch (err) {
      setLastError(toErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const exportRules = (): void => {
    navigator.clipboard
      .writeText(JSON.stringify(rules, null, 2))
      .then(() => message.success('规则 JSON 已复制到剪贴板'))
      .catch((err) => message.error(toErrorText(err)));
  };

  useEffect(() => {
    void loadRules();
  }, []);

  return (
    <div className="erp-ceo-tab-content">
      <Card variant="borderless" className="erp-market-table-card">
        <div className="erp-ceo-section-title">历史规则归档（只读）</div>
        <Alert
          type="warning"
          showIcon
          title="runtimeEffect: none — 不参与主群线上路由"
          description={
            runtimeNotes ??
            '主群 Intent 仅做受众路由（audience_resolution + targetAgentIds）。本页规则仅作历史存盘查阅，Worker 不读取；调试请以 Debugger 中 Worker 真值为准。'
          }
          style={{ marginBottom: 12 }}
        />
        {runtimeEffect ? (
          <div className="erp-market-agent-meta" style={{ marginBottom: 12 }}>
            API 元数据：runtimeEffect={runtimeEffect}
          </div>
        ) : null}
        {lastError ? <Alert type="error" showIcon title="加载失败" description={lastError} style={{ marginBottom: 12 }} /> : null}
        <div className="erp-intent-actions">
          <Button onClick={() => void loadRules()} loading={busy}>
            刷新归档
          </Button>
          <Button onClick={exportRules} disabled={busy || rules.length === 0}>
            导出 JSON
          </Button>
        </div>
        <Card
          size="small"
          style={{ marginTop: 12, background: '#fafafa' }}
          title={`归档规则（${rules.length}）`}
        >
          {rules.length === 0 ? (
            <div className="erp-market-agent-meta">暂无历史规则（默认空列表）。</div>
          ) : (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {rules.map((rule) => (
                <Card key={rule.id} size="small">
                  <div className="erp-intent-inline-fields" style={{ gridTemplateColumns: '2fr 3fr' }}>
                    <div>
                      <div className="erp-intent-field-label">规则</div>
                      <div>{rule.name}</div>
                      <div className="erp-market-agent-meta">{rule.id}</div>
                    </div>
                    <div>
                      <div className="erp-intent-field-label">内容（只读）</div>
                      <div>{rule.intentType}</div>
                      <div className="erp-market-agent-meta">
                        enabled={String(rule.enabled)} · priority={rule.priority} · confidence={rule.confidence} · risk=
                        {rule.riskLevel}
                      </div>
                      <div className="erp-market-agent-meta">{rule.reason}</div>
                      {rule.conditions?.keywords?.length ? (
                        <div className="erp-market-agent-meta">keywords: {rule.conditions.keywords.join(', ')}</div>
                      ) : null}
                      {rule.conditions?.regex ? (
                        <div className="erp-market-agent-meta">regex: {rule.conditions.regex}</div>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </Space>
          )}
        </Card>
      </Card>
    </div>
  );
}

type IntentDebuggerTabProps = {
  form: IntentGlobalFormState;
};

function WorkerIntentPreviewCard({ raw }: { raw: Record<string, unknown> }): ReactElement {
  const rh = raw.routingHints && typeof raw.routingHints === 'object' && !Array.isArray(raw.routingHints)
    ? (raw.routingHints as Record<string, unknown>)
    : {};
  const md =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const ufr =
    raw.userFacingReply && typeof raw.userFacingReply === 'object' && !Array.isArray(raw.userFacingReply)
      ? (raw.userFacingReply as { text?: unknown }).text
      : '';
  const tgt = rh.targetAgentIds;
  const ids = Array.isArray(tgt) ? tgt.map((x) => String(x ?? '')).filter(Boolean).join(', ') : '';
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Alert
        type="success"
        showIcon
        title="Worker IntentLayer 真值（主群 recognizeIntent）"
        description="以下为运行时 IntentDecision；与 Rule Studio 本地沙盘可能不一致。"
      />
      <div className="erp-intent-inline-fields" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div>
          <div className="erp-intent-field-label">intentType</div>
          <div>{String(raw.intentType ?? '—')}</div>
        </div>
        <div>
          <div className="erp-intent-field-label">confidence</div>
          <div>{typeof raw.confidence === 'number' ? raw.confidence.toFixed(3) : String(raw.confidence ?? '—')}</div>
        </div>
        <div>
          <div className="erp-intent-field-label">traceId</div>
          <div style={{ wordBreak: 'break-all' }}>{String(raw.traceId ?? '—')}</div>
        </div>
      </div>
      <div>
        <div className="erp-intent-field-label">explanation</div>
        <div>{String(raw.explanation ?? '')}</div>
      </div>
      <div className="erp-intent-inline-fields" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div>
          <div className="erp-intent-field-label">metadata.primaryAudience</div>
          <div>{String(md.primaryAudience ?? '—')}</div>
        </div>
        <div>
          <div className="erp-intent-field-label">routingHints.explicitDirectTargets</div>
          <div>{String(rh.explicitDirectTargets ?? '—')}</div>
        </div>
      </div>
      <div>
        <div className="erp-intent-field-label">routingHints.targetAgentIds</div>
        <div>{ids || '—'}</div>
      </div>
      <div>
        <div className="erp-intent-field-label">metadata.llmTargetResponder</div>
        <div>{String(md.llmTargetResponder ?? '—')}</div>
      </div>
      <div>
        <div className="erp-intent-field-label">userFacingReply.text（仅服务端策略）</div>
        <div>{ufr ? String(ufr) : '—'}</div>
      </div>
    </Space>
  );
}

function IntentDebuggerTab(_props: IntentDebuggerTabProps): ReactElement {
  const [debugForm, setDebugForm] = useState<IntentDebuggerFormState>({
    text: '',
    companyId: 'platform-preview-company',
    roomId: 'platform-preview-room',
    messageId: '',
    mentionedAgentIdsText: '',
    mentionedNodeIdsText: '',
    roomAgentIdsText: '',
    roomOrgNodeIdsText: '',
    ceoAgentId: '',
    messageCategory: '',
  });
  const [workerPayload, setWorkerPayload] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const runPreview = async (): Promise<void> => {
    const trimmed = debugForm.text.trim();
    if (!trimmed) {
      message.warning('请先输入测试文本');
      return;
    }
    setBusy(true);
    setWorkerPayload(null);
    try {
      const result = await requestJson<Record<string, unknown>>('/api/v1/admin/platform-settings/intent-layer-preview', {
        method: 'PATCH',
        body: JSON.stringify({
          text: trimmed,
          companyId: debugForm.companyId.trim() || undefined,
          roomId: debugForm.roomId.trim() || undefined,
          messageId: debugForm.messageId.trim() || undefined,
          mentionedAgentIds: parseIdList(debugForm.mentionedAgentIdsText),
          mentionedNodeIds: parseIdList(debugForm.mentionedNodeIdsText),
          roomAgentIds: parseIdList(debugForm.roomAgentIdsText),
          roomOrgNodeIds: parseIdList(debugForm.roomOrgNodeIdsText),
          ceoAgentId: debugForm.ceoAgentId.trim() || undefined,
          messageCategory: debugForm.messageCategory || undefined,
        }),
      });
      if (isWorkerIntentDecisionPayload(result)) {
        setWorkerPayload(result);
      } else {
        setWorkerPayload(null);
        message.warning('预览响应不是 Worker IntentDecision，请检查 preview 接口配置');
      }
    } catch (err) {
      setWorkerPayload(null);
      message.error(`Worker 预览失败：${toErrorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erp-ceo-tab-content">
      <Card variant="borderless" className="erp-market-table-card">
        <div className="erp-ceo-section-title">调试工具页（Debugger）</div>
        <div className="erp-market-agent-meta">
          调用 Worker 内部预览接口返回真实受众路由结果（IntentDecision）。Worker 不可用时请检查模型配置，勿依赖 Rule Studio 本地沙盘。
        </div>
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Input.TextArea
            rows={5}
            value={debugForm.text}
            onChange={(e) => setDebugForm((prev) => ({ ...prev, text: e.target.value }))}
            placeholder="输入一段用户请求，查看 IntentLayer 预估路由结果..."
          />
          <div className="erp-intent-actions">
            <Button onClick={() => setAdvancedOpen((prev) => !prev)}>
              {advancedOpen ? '收起高级参数' : '展开高级参数'}
            </Button>
          </div>
          {advancedOpen ? (
            <Card size="small" style={{ background: '#fafafa' }} title="高级参数">
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div className="erp-intent-inline-fields">
                  <div>
                    <div className="erp-intent-field-label">Company ID</div>
                    <Input value={debugForm.companyId} onChange={(e) => setDebugForm((prev) => ({ ...prev, companyId: e.target.value }))} />
                  </div>
                  <div>
                    <div className="erp-intent-field-label">Room ID</div>
                    <Input value={debugForm.roomId} onChange={(e) => setDebugForm((prev) => ({ ...prev, roomId: e.target.value }))} />
                  </div>
                  <div>
                    <div className="erp-intent-field-label">Message ID</div>
                    <Input value={debugForm.messageId} onChange={(e) => setDebugForm((prev) => ({ ...prev, messageId: e.target.value }))} />
                  </div>
                </div>
                <div className="erp-intent-inline-fields">
                  <div>
                    <div className="erp-intent-field-label">CEO Agent ID</div>
                    <Input value={debugForm.ceoAgentId} onChange={(e) => setDebugForm((prev) => ({ ...prev, ceoAgentId: e.target.value }))} />
                  </div>
                  <div>
                    <div className="erp-intent-field-label">Message Category</div>
                    <Select
                      allowClear
                      value={debugForm.messageCategory || undefined}
                      style={{ width: '100%' }}
                      onChange={(value) => setDebugForm((prev) => ({ ...prev, messageCategory: (value ?? '') as IntentDebuggerFormState['messageCategory'] }))}
                      options={[
                        { label: 'chat', value: 'chat' },
                        { label: 'task_publish', value: 'task_publish' },
                        { label: 'report', value: 'report' },
                        { label: 'approval', value: 'approval' },
                        { label: 'coordination', value: 'coordination' },
                        { label: 'broadcast', value: 'broadcast' },
                      ]}
                    />
                  </div>
                </div>
                <div className="erp-intent-inline-fields">
                  <div>
                    <div className="erp-intent-field-label">Mentioned Agent IDs</div>
                    <Input.TextArea
                      rows={3}
                      value={debugForm.mentionedAgentIdsText}
                      onChange={(e) => setDebugForm((prev) => ({ ...prev, mentionedAgentIdsText: e.target.value }))}
                      placeholder="逗号或换行分隔"
                    />
                  </div>
                  <div>
                    <div className="erp-intent-field-label">Mentioned Node IDs</div>
                    <Input.TextArea
                      rows={3}
                      value={debugForm.mentionedNodeIdsText}
                      onChange={(e) => setDebugForm((prev) => ({ ...prev, mentionedNodeIdsText: e.target.value }))}
                      placeholder="逗号或换行分隔"
                    />
                  </div>
                </div>
                <div className="erp-intent-inline-fields">
                  <div>
                    <div className="erp-intent-field-label">Room Agent IDs</div>
                    <Input.TextArea
                      rows={4}
                      value={debugForm.roomAgentIdsText}
                      onChange={(e) => setDebugForm((prev) => ({ ...prev, roomAgentIdsText: e.target.value }))}
                      placeholder="当前房间 agent 成员列表，逗号或换行分隔"
                    />
                  </div>
                  <div>
                    <div className="erp-intent-field-label">Room Org Node IDs</div>
                    <Input.TextArea
                      rows={4}
                      value={debugForm.roomOrgNodeIdsText}
                      onChange={(e) => setDebugForm((prev) => ({ ...prev, roomOrgNodeIdsText: e.target.value }))}
                      placeholder="当前房间组织节点列表，逗号或换行分隔"
                    />
                  </div>
                </div>
              </Space>
            </Card>
          ) : null}
          <div className="erp-intent-actions">
            <Button
              onClick={() => {
                setDebugForm({
                  text: '',
                  companyId: 'platform-preview-company',
                  roomId: 'platform-preview-room',
                  messageId: '',
                  mentionedAgentIdsText: '',
                  mentionedNodeIdsText: '',
                  roomAgentIdsText: '',
                  roomOrgNodeIdsText: '',
                  ceoAgentId: '',
                  messageCategory: '',
                });
                setWorkerPayload(null);
              }}
            >
              清空
            </Button>
            <Button type="primary" onClick={() => void runPreview()} loading={busy}>开始测试</Button>
          </div>
          {workerPayload ? (
            <Card size="small" style={{ background: '#fafafa' }} title="预演结果">
              <WorkerIntentPreviewCard raw={workerPayload} />
            </Card>
          ) : null}
        </Space>
      </Card>
    </div>
  );
}

function IntentLogsMonitorTab(): ReactElement {
  return (
    <div className="erp-ceo-tab-content">
      <Card variant="borderless" className="erp-market-table-card">
        <div className="erp-ceo-section-title">日志与监控页</div>
        <div className="erp-market-agent-meta">过滤查询 + 告警配置</div>
        <div className="erp-intent-company-toolbar">
          <Select
            defaultValue="all"
            style={{ width: 220 }}
            options={[
              { label: '全部意图', value: 'all' },
              { label: 'direct_summon', value: 'direct_summon' },
              { label: 'orchestration', value: 'orchestration' },
              { label: 'strategy', value: 'strategy' },
              { label: 'ceo_reply', value: 'ceo_reply' },
              { label: 'approval', value: 'approval' },
            ]}
          />
          <Select
            defaultValue="warn"
            style={{ width: 180 }}
            options={[
              { label: '告警等级: warning+', value: 'warn' },
              { label: '告警等级: error', value: 'error' }
            ]}
          />
          <Button>查询日志</Button>
          <Button type="primary">配置告警</Button>
        </div>
      </Card>
    </div>
  );
}

function IntentOutputSchemaTab(): ReactElement {
  const [loading, setLoading] = useState(false);
  const [schemaText, setSchemaText] = useState<string>('{}');

  const loadSchema = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await requestJson<Record<string, unknown>>(
        '/api/v1/admin/platform-settings/intent-layer-output-schema',
      );
      setSchemaText(JSON.stringify(data, null, 2));
    } catch (err) {
      setSchemaText(JSON.stringify({ error: 'failed_to_load_schema', detail: toErrorText(err) }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSchema();
  }, []);

  return (
    <div className="erp-ceo-tab-content">
      <Card variant="borderless" className="erp-market-table-card">
        <div className="erp-ceo-section-title">Intent 输出协议（只读）</div>
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 8 }}
          message="与 CEO 管线协议分离"
          description="本接口仅返回 IntentLayer / IntentDecision 相关说明。CEO v2 L1–L3 大块 JSON 请参考 CEO 层配置页加载的 ceo-pipeline-output-schema。"
        />
        <div className="erp-intent-actions" style={{ marginTop: 12 }}>
          <Button type="primary" onClick={() => void loadSchema()} loading={loading}>
            刷新协议 JSON
          </Button>
        </div>
        <Card size="small" title="后端实时返回" style={{ marginTop: 12 }}>
          <Input.TextArea readOnly rows={22} value={schemaText} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </Card>
      </Card>
    </div>
  );
}

export function IntentLayerConfigTab(): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<IntentGlobalFormState>(DEFAULT_INTENT_GLOBAL_FORM);
  const [modelAssetsLoading, setModelAssetsLoading] = useState(false);
  const [chatModels, setChatModels] = useState<Array<{ label: string; value: string }>>([]);
  const [keysByModelName, setKeysByModelName] = useState<Record<string, Array<{ id: string; alias: string }>>>({});

  const modelKeys = keysByModelName[form.model] ?? [];
  const fallbackModelKeys = keysByModelName[form.fallbackModel] ?? [];

  const loadModelAssets = async (): Promise<void> => {
    setModelAssetsLoading(true);
    try {
      const [modelsRes, keysRes] = await Promise.all([
        requestJson<{ items?: Array<{ modelName: string; providerCode: string; modelType: string; isActive: boolean }> }>(
          '/api/admin/llm-models?modelType=chat&isActive=true',
        ),
        requestJson<{
          groups?: Array<{
            modelName: string;
            modelType?: string;
            keys?: Array<{ id: string; keyAlias: string; isActive: boolean; isBound?: boolean }>;
          }>;
        }>('/api/admin/llm-keys/grouped?modelType=chat&isActive=true'),
      ]);
      const modelOptions = (modelsRes.items ?? [])
        .filter((item) => item.modelType === 'chat' && item.isActive)
        .map((item) => ({
          label: `${item.modelName} (${item.providerCode})`,
          value: item.modelName,
        }));
      setChatModels(modelOptions);
      const grouped: Record<string, Array<{ id: string; alias: string }>> = {};
      for (const group of keysRes.groups ?? []) {
        if (group.modelType && group.modelType !== 'chat') continue;
        const modelName = String(group.modelName ?? '').trim();
        if (!modelName) continue;
        grouped[modelName] = (group.keys ?? [])
          .filter((key) => key.isActive)
          .map((key) => ({ id: key.id, alias: key.isBound ? `${key.keyAlias} (已绑定)` : key.keyAlias }));
      }
      setKeysByModelName(grouped);
    } catch (err) {
      messageApi.error(`模型库加载失败：${toErrorText(err)}`);
    } finally {
      setModelAssetsLoading(false);
    }
  };

  const loadConfig = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const payload = await requestJson<IntentLayerGlobalSettingsApiResponse>(
        '/api/v1/admin/platform-settings/intent-layer-global-settings',
      );
      const settings = unwrapIntentLayerGlobalSettings(payload);
      setForm(normalizeIntentGlobalForm({
        classifier: {
          contextPolicy: {
            intentLayer: {
              globalSettings: settings,
            },
          },
        },
      }));
    } catch (err) {
      setError(toErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  useEffect(() => {
    void loadModelAssets();
  }, []);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await requestJson('/api/v1/admin/platform-settings/intent-layer-global-settings', {
        method: 'PATCH',
        body: JSON.stringify(buildIntentGlobalSettingsSaveBody(form)),
      });
      messageApi.success('平台配置已保存');
    } catch (err) {
      setError(toErrorText(err));
      messageApi.error('保存失败，请查看错误提示');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="erp-ceo-tab-content">
      {contextHolder}
      <Card variant="borderless" className="erp-market-table-card">
        <div className="erp-intent-company-toolbar">
          <Button onClick={() => void loadConfig()} loading={loading}>
            刷新平台配置
          </Button>
          <Input value="platform-global" readOnly placeholder="平台级配置作用域" style={{ width: 360 }} />
        </div>
        <Alert
          type="info"
          showIcon
          title="平台级配置模式"
          description="保存后将写入 platform_settings，并下发到各公司「strategy.contextPolicy.intentLayer」：Worker 会读取其中的 modelName / keyIds（与 globalSettings.model、modelKeyId 同步）。新建公司已自动套用；存量环境保存一次即可刷新全租户。"
          style={{ marginTop: 12 }}
        />
        <Alert
          type="info"
          showIcon
          title="2026 受众路由层（IntentLayer）如何生效"
          description={
            <span>
              主群 Intent <strong>仅识别接话人</strong>，固定 <code>audience_resolution</code>；System Prompt 为 Worker 内建（<code>audience-routing.prompt.ts</code>），本页主要配置<strong>路由模型</strong>。语义分类（任务/审批/战略）由下游 CEO Replay / Strategy 承担。调试请以 Debugger 中 Worker 真值为准；历史规则归档为只读（API <code>runtimeEffect: none</code>），不参与线上路由。
            </span>
          }
          style={{ marginTop: 12 }}
        />
        {error ? (
          <Alert type="error" showIcon title="请求失败" description={error} style={{ marginTop: 12 }} />
        ) : null}
      </Card>

      {loading ? (
        <Card variant="borderless" className="erp-market-table-card">
          <Spin />
        </Card>
      ) : null}

      <Tabs
        className="erp-intent-tabs"
        items={[
          {
            key: 'global-settings',
            label: '全局配置页（Global Settings）',
            children: (
              <IntentGlobalSettingsTab
                form={form}
                chatModels={chatModels}
                modelKeys={modelKeys}
                fallbackModelKeys={fallbackModelKeys}
                modelAssetsLoading={modelAssetsLoading}
                onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                onRefreshModelAssets={() => void loadModelAssets()}
                onReset={() => setForm(DEFAULT_INTENT_GLOBAL_FORM)}
                onSave={() => void handleSave()}
                saving={saving}
              />
            )
          },
          {
            key: 'per-company',
            label: '公司配置页（Per Company）',
            children: <IntentPerCompanyTab />
          },
          {
            key: 'rule-studio',
            label: '历史规则归档（只读）',
            children: <IntentRuleArchiveTab />
          },
          {
            key: 'debugger',
            label: '调试工具页（Debugger）',
            children: <IntentDebuggerTab form={form} />
          },
          {
            key: 'intent-output-schema',
            label: 'Intent 输出协议（只读）',
            children: <IntentOutputSchemaTab />
          },
          {
            key: 'logs-monitor',
            label: '日志与监控页',
            children: <IntentLogsMonitorTab />
          }
        ]}
      />
    </div>
  );
}
