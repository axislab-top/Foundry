import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography,
  message
} from 'antd';
import { adminAuthedRequestJson } from '../../../shared/api/client';

const { Paragraph, Text, Title } = Typography;

type LayerItem = {
  key: string;
  name: string;
  recommendation: string;
  detail: string;
};

type LayerConfig = {
  key: 'l1' | 'l2' | 'l3';
  title: string;
  description: string;
  alertType: 'info' | 'success' | 'warning';
  alertMessage: string;
  temperatureRange: [number, number];
  items: LayerItem[];
};

type LlmModelInfo = {
  id: string;
  providerCode: string;
  modelName: string;
  modelType: string;
  isActive: boolean;
};

type LlmKeyInfo = {
  id: string;
  keyAlias: string;
  isActive: boolean;
  isBound?: boolean;
};

type LlmKeyPoolGroup = {
  provider?: string;
  modelName: string;
  modelType?: string;
  keys: LlmKeyInfo[];
};

type LayerPersistedConfig = {
  modelName?: string;
  modelProviderCode?: string;
  keyIds?: string[];
  skillIds?: string[];
  systemPrompt?: string;
  temperature?: number;
  enableMemoryRetrieval?: boolean;
  historyMessagesLimit?: number;
  timeoutMs?: number;
  distributionRuleMode?: 'rules_first' | 'hybrid' | 'llm_assisted';
  specialConfig?: Record<string, unknown>;
};

type PlatformIntentLayerGlobalSettings = {
  ceoLayers?: Partial<Record<'strategy' | 'orchestration' | 'supervision', LayerPersistedConfig>>;
  [key: string]: unknown;
};

type MarketplaceAgentDetail = {
  id: string;
  slug: string;
  ceoLayerConfig?: Record<string, unknown>;
  keyBindings?: Array<{
    llmKeyId: string;
    sortOrder: number;
    ceoLayer?: string;
  }>;
};

const CEO_CANONICAL_LAYERS = ['strategy', 'orchestration', 'supervision'] as const;

const toCanonicalLayerKey = (layerKey: 'l1' | 'l2' | 'l3'): 'strategy' | 'orchestration' | 'supervision' => {
  if (layerKey === 'l1') return 'strategy';
  if (layerKey === 'l2') return 'orchestration';
  return 'supervision';
};

type SkillOption = {
  id: string;
  name: string;
  description?: string | null;
};

/**
 * 与 Worker 对齐：L1 主群协作由运行时追加 strategyGoal JSON 契约；CEO v2 另有一套 goal/strategicPhases 契约（勿在本模板写死另一套示例）。
 * L2/L3 的「当次 JSON」由各自调用点的系统消息约束，本模板只定义角色、边界与语气。
 */
const DEFAULT_LAYER_SYSTEM_PROMPTS: Record<'l1' | 'l2' | 'l3', string> = {
  l1: [
    '# 角色',
    '你是 Foundry 企业群聊「主室」战略层（CEO L1 / Strategy）。意图已由上游识别；你的任务是把用户与组织上下文上升为**可衡量、可评审**的战略结论，而不是执行工单。',
    '',
    '# 职责',
    '- 明确战略目标、阶段性成果（可验收里程碑）、约束与风险；判断是否需要更高层级人工把关及理由。',
    '- 不写部门级任务拆分（交给 L2）；不编造组织中不存在的部门、人员或项目。',
    '- 表述简洁；中文优先，专有名词可保留英文。',
    '',
    '# 风格与禁忌',
    '- 像资深战略顾问：先收敛问题定义，再给可验证的取舍，避免空泛励志句。',
    '- 不要输出 Markdown 代码块；不要自拟与运行时冲突的 JSON 字段名。',
    '',
    '# 与机器解析协同',
    '主群协作路径下，运行时会在你之后追加**固定 JSON 输出契约**（strategyGoal、strategicPhases、constraints、risks、needsApproval 等）。',
    'CEO 自动规划（v2）另使用 goal/strategicPhases 等字段——两套不要混写进本模板；此处只描述思考方式、行业口径与风险哲学即可。',
  ].join('\n'),
  l2: [
    '# 角色',
    '你是 Foundry CEO 协调层（L2 / Orchestration）：在战略方向已批准或已锁定的前提下，把目标拆解为**可派发、可并行、可追踪**的工作包或路由提示。',
    '',
    '# 职责',
    '- 关注「谁做什么、先后与依赖、是否并行、阻塞点」；在部门间公平分摊负载。',
    '- 不重复 L1 的战略论证；不代替 L3 做最终质量裁决与用户可见合成话术。',
    '- 若输入含任务/部门列表，优先保持与上游 plan 的 id 与语义一致。',
    '',
    '# 与机器解析协同',
    'CEO v2 全链路中 Distribution 有独立结构化 schema；主群里轻量 L2 分发另可能出现 JSON 数组（如 sourceTaskId、department、priority）——以**当次系统消息**为准。',
    '本模板只定义协调视角、确定性与可执行性；不要输出 Markdown 围栏。',
  ].join('\n'),
  l3: [
    '# 角色',
    '你是 Foundry CEO 监督层（L3 / Supervision）：跟进执行全景，合并子结果，**客观**暴露风险、超时与不一致；在需要时给出可拼进最终答复的补充文字或后续步骤。',
    '',
    '# 职责',
    '- 对事实敏感：证据不足时给出有界结论，并列出下一步验证项。',
    '- 不为迎合用户而弱化风险；不泄露内部路由、@mention 解析等元数据。',
    '- 优先稳定性、可观测与可回滚的决策建议。',
    '',
    '# 与机器解析协同',
    'CEO v2 中 Supervision 补偿输出有独立 schema；主群路径下顾问可能要求 { finalTextAppend, suggestedNextSteps } 形态——以**当次系统消息**为准。',
    '本模板只定义监督语气与原则；不要输出 Markdown 代码块。',
  ].join('\n'),
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return adminAuthedRequestJson<T>(url, init);
}

async function fetchCeoTemplateDetail(): Promise<MarketplaceAgentDetail> {
  const list = await requestJson<{ items?: Array<{ id: string; slug: string }> }>(
    '/api/admin/marketplace/agents?page=1&pageSize=100&search=ceo&status=all',
  );
  const row = (list.items ?? []).find((item) => String(item.slug).trim() === 'ceo');
  if (!row?.id) {
    throw new Error('未找到 slug=ceo 的商城模板');
  }
  return requestJson<MarketplaceAgentDetail>(`/api/admin/marketplace/agents/${row.id}`);
}

function normalizeTemplateSettings(template: MarketplaceAgentDetail): PlatformIntentLayerGlobalSettings {
  const ceoLayerConfig =
    template.ceoLayerConfig && typeof template.ceoLayerConfig === 'object' && !Array.isArray(template.ceoLayerConfig)
      ? (template.ceoLayerConfig as Record<string, unknown>)
      : {};
  return {
    ceoLayers: {
      strategy: (ceoLayerConfig.strategy as LayerPersistedConfig | undefined) ?? {},
      orchestration: (ceoLayerConfig.orchestration as LayerPersistedConfig | undefined) ?? {},
      supervision: (ceoLayerConfig.supervision as LayerPersistedConfig | undefined) ?? {},
    },
  };
}

async function loadIntentLayerSettings(): Promise<PlatformIntentLayerGlobalSettings> {
  const template = await fetchCeoTemplateDetail();
  return normalizeTemplateSettings(template);
}

async function saveLayerPatch(layerKey: 'l1' | 'l2' | 'l3', patch: LayerPersistedConfig): Promise<void> {
  const template = await fetchCeoTemplateDetail();
  const current = normalizeTemplateSettings(template);
  const canonical = toCanonicalLayerKey(layerKey);
  const prevLayer = current.ceoLayers?.[canonical] ?? {};
  const mergedCeoLayers: NonNullable<PlatformIntentLayerGlobalSettings['ceoLayers']> = {
    ...(current.ceoLayers ?? {}),
    [canonical]: {
      ...prevLayer,
      ...patch,
    },
  };
  await requestJson(`/api/admin/marketplace/agents/${template.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ceoLayerConfig: mergedCeoLayers,
    }),
  });
}

async function saveLayerModelAndKeys(
  layerKey: 'l1' | 'l2' | 'l3',
  modelName: string,
  modelProviderCode: string,
  keyIds: string[],
  knownKeyIds: string[] = []
): Promise<{ bindingsCommitted: boolean; pendingLayers: Array<'strategy' | 'orchestration' | 'supervision'> }> {
  const template = await fetchCeoTemplateDetail();
  const canonical = toCanonicalLayerKey(layerKey);
  const current = normalizeTemplateSettings(template);
  const prevLayer = current.ceoLayers?.[canonical] ?? {};
  const nextCeoLayerConfig: NonNullable<PlatformIntentLayerGlobalSettings['ceoLayers']> = {
    ...(current.ceoLayers ?? {}),
    [canonical]: {
      ...prevLayer,
      modelName,
      modelProviderCode,
      keyIds,
    },
  };
  const existing = Array.isArray(template.keyBindings) ? template.keyBindings : [];
  const knownKeyIdSet = new Set(knownKeyIds.map((id) => String(id ?? '').trim()).filter(Boolean));
  const existingByLayer = new Map<'strategy' | 'orchestration' | 'supervision', string[]>();
  for (const layer of CEO_CANONICAL_LAYERS) {
    const ids = existing
      .filter((row) => String(row.ceoLayer ?? '').trim() === layer)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => String(row.llmKeyId ?? '').trim())
      .filter(Boolean);
    existingByLayer.set(layer, ids);
  }
  const mergedKeyBindings = CEO_CANONICAL_LAYERS.flatMap((layer) => {
    const existingIds = existingByLayer.get(layer) ?? [];
    let sourceIds: string[];
    if (layer === canonical) {
      sourceIds = keyIds.map((id) => String(id ?? '').trim()).filter(Boolean);
    } else if (existingIds.length > 0) {
      sourceIds = existingIds;
    } else {
      const layerConfig = nextCeoLayerConfig[layer];
      const configKeyIds = Array.isArray(layerConfig?.keyIds)
        ? layerConfig.keyIds.map((id) => String(id ?? '').trim()).filter(Boolean)
        : [];
      if (knownKeyIdSet.size === 0) {
        sourceIds = configKeyIds;
      } else {
        sourceIds = configKeyIds.filter((id) => knownKeyIdSet.has(id));
      }
    }
    return sourceIds.map((llmKeyId, sortOrder) => ({
      llmKeyId,
      sortOrder,
      ceoLayer: layer,
    }));
  });
  const missingLayers = CEO_CANONICAL_LAYERS.filter(
    (layer) => !mergedKeyBindings.some((row) => row.ceoLayer === layer),
  );
  if (missingLayers.length > 0) {
    await requestJson(`/api/admin/marketplace/agents/${template.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ceoLayerConfig: nextCeoLayerConfig,
      }),
    });
    return { bindingsCommitted: false, pendingLayers: missingLayers };
  }
  await requestJson(`/api/admin/marketplace/agents/${template.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ceoLayerConfig: nextCeoLayerConfig,
      keyBindings: mergedKeyBindings,
    }),
  });
  return { bindingsCommitted: true, pendingLayers: [] };
}

function ModelSelectorPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<LlmModelInfo[]>([]);
  const [groups, setGroups] = useState<LlmKeyPoolGroup[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId),
    [models, selectedModelId]
  );

  const currentModelKeys = useMemo(() => {
    if (!selectedModel) return [];
    const selectedProviderCode = selectedModel.providerCode;
    const group =
      groups.find(
        (item) =>
          item.modelName === selectedModel.modelName &&
          item.provider === selectedProviderCode &&
          item.modelType === 'chat'
      ) ??
      groups.find(
        (item) =>
          item.modelName === selectedModel.modelName &&
          item.provider === selectedProviderCode
      ) ??
      groups.find((item) => item.modelName === selectedModel.modelName && item.modelType === 'chat') ??
      groups.find((item) => item.modelName === selectedModel.modelName);
    return (group?.keys ?? []).filter((key) => key.isActive);
  }, [groups, selectedModel]);

  const availableKeys = useMemo(
    // 展示该模型全部可用 key，已绑定项仅做标注，不在选择器中隐藏
    () => currentModelKeys,
    [currentModelKeys],
  );

  const loadModelAssets = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [modelsRes, keysRes] = await Promise.all([
        requestJson<{ items?: LlmModelInfo[] }>('/api/admin/llm-models?modelType=chat&isActive=true'),
        requestJson<{ groups?: LlmKeyPoolGroup[] }>('/api/admin/llm-keys/grouped?modelType=chat')
      ]);
      const nextModels = (modelsRes.items ?? []).filter((item) => item.modelType === 'chat' && item.isActive);
      const nextGroups = keysRes.groups ?? [];
      setModels(nextModels);
      setGroups(nextGroups);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadPersistedLayerConfig = async (): Promise<void> => {
    try {
      const settings = await loadIntentLayerSettings();
      const layerConfig = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      const modelName = layerConfig?.modelName?.trim();
      const modelProviderCode = layerConfig?.modelProviderCode?.trim();
      if (!modelName) return;
      const matchedModel =
        (modelProviderCode
          ? models.find((item) => item.modelName === modelName && item.providerCode === modelProviderCode)
          : undefined) ?? models.find((item) => item.modelName === modelName);
      if (!matchedModel) return;
      setSelectedModelId(matchedModel.id);
      const persistedKeyIds = Array.isArray(layerConfig?.keyIds) ? layerConfig.keyIds : [];
      setSelectedKeyIds(
        persistedKeyIds
          .map((item) => String(item).trim())
          .filter(Boolean)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void loadModelAssets();
  }, []);

  useEffect(() => {
    if (models.length === 0) return;
    void loadPersistedLayerConfig();
  }, [layerKey, models]);

  const saveLayerConfig = async (): Promise<void> => {
    if (!selectedModel) {
      messageApi.warning('请先选择模型');
      return;
    }
    const unknownSelected = selectedKeyIds.filter((id) => !currentModelKeys.some((key) => key.id === id));
    if (unknownSelected.length > 0) {
      messageApi.error('存在不属于当前模型的 Key，请重新选择后再保存');
      return;
    }
    if (selectedKeyIds.length === 0) {
      messageApi.warning('请至少选择一个 Key，再保存当前层配置');
      return;
    }
    setSaving(true);
    try {
      const knownKeyIds = groups.flatMap((group) => group.keys.map((key) => key.id));
      const saveResult = await saveLayerModelAndKeys(
        layerKey,
        selectedModel.modelName,
        selectedModel.providerCode,
        selectedKeyIds,
        knownKeyIds,
      );
      if (saveResult.bindingsCommitted) {
        messageApi.success(`${layerKey.toUpperCase()} 配置已保存`);
      } else {
        messageApi.success(
          `${layerKey.toUpperCase()} 已保存；其余层待补齐后将自动提交 Key 绑定（待补齐：${saveResult.pendingLayers.join(', ')}）`,
        );
      }
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Select
          placeholder="从模型库选择 chat 模型"
          style={{ width: '100%' }}
          value={selectedModelId}
          onChange={(value) => {
            setSelectedModelId(value);
            setSelectedKeyIds([]);
          }}
          options={models.map((model) => ({
            label: `${model.modelName} (${model.providerCode})`,
            value: model.id
          }))}
          loading={loading}
        />
        <Button onClick={() => void loadModelAssets()} loading={loading}>
          刷新
        </Button>
        <Button type="primary" onClick={() => void saveLayerConfig()} loading={saving} disabled={!selectedModel}>
          保存当前层配置
        </Button>
      </div>

      <Select
        mode="multiple"
        placeholder={selectedModel ? '选择该模型 key（已保存绑定会保留显示）' : '请先选择模型'}
        style={{ width: '100%' }}
        value={selectedKeyIds}
        onChange={setSelectedKeyIds}
        disabled={!selectedModel}
        options={availableKeys.map((key) => ({
          label: `${key.keyAlias} (${key.id.slice(0, 8)})${key.isBound ? ' · 已绑定' : ''}`,
          value: key.id
        }))}
      />

      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="当前模型">
          <Text>{selectedModel ? `${selectedModel.modelName} (${selectedModel.providerCode})` : '未选择'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="可选 Key 数">
          <Text>{availableKeys.length}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="已选 Key">
          <Text>{selectedKeyIds.length ? selectedKeyIds.join(', ') : '未选择'}</Text>
        </Descriptions.Item>
      </Descriptions>

      {loading ? <Spin size="small" /> : null}
      {error ? <Alert type="error" showIcon message="模型库加载失败" description={error} /> : null}
    </Space>
  );
}

function SystemPromptPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');

  const loadPersistedPrompt = async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await loadIntentLayerSettings();
      const layerConfig = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      setSystemPrompt(String(layerConfig?.systemPrompt ?? ''));
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPersistedPrompt();
  }, [layerKey]);

  const saveSystemPrompt = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveLayerPatch(layerKey, { systemPrompt: systemPrompt.trim() });
      messageApi.success(`${layerKey.toUpperCase()} System Prompt 已保存`);
      await loadPersistedPrompt();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaultPrompt = async (): Promise<void> => {
    const next = DEFAULT_LAYER_SYSTEM_PROMPTS[layerKey];
    setSystemPrompt(next);
    setSaving(true);
    try {
      await saveLayerPatch(layerKey, { systemPrompt: next });
      messageApi.success(`${layerKey.toUpperCase()} 已恢复默认模板`);
      await loadPersistedPrompt();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <Alert
        type="info"
        showIcon
        message="三层分工与数据来源"
        description={
          <Space direction="vertical" size={6}>
            <Text>
              <Text strong>L1 战略层</Text>：定目标、阶段性成果、约束/风险与是否把关；主群协作下由 Worker 追加 strategyGoal
              等 JSON 契约。CEO v2 另用 goal/strategicPhases 等字段——见「输出格式」Tab 中 dualTracks 说明。
            </Text>
            <Text>
              <Text strong>L2 协调层</Text>：拆任务包、依赖与并行、派发与负载；结构化形状依调用场景而定。
            </Text>
            <Text>
              <Text strong>L3 监督层</Text>：盯执行、合并结果、暴露阻塞；合成话术或补偿 JSON 依调用场景而定。
            </Text>
            <Text type="secondary">
              「重新加载」从商城 CEO 模板（slug=ceo）读取已保存的 systemPrompt。「输出格式」Tab
              的 JSON 来自平台只读接口，含 CEO v2 与主群双轨说明，与左侧文本来源不同属正常。
            </Text>
          </Space>
        }
      />
      <Input.TextArea
        rows={8}
        value={systemPrompt}
        onChange={(event) => setSystemPrompt(event.target.value)}
        placeholder="输入该层 System Prompt，保存后将作为后端运行时配置"
      />
      <Space>
        <Button type="primary" onClick={() => void saveSystemPrompt()} loading={saving}>
          保存 System Prompt
        </Button>
        <Button onClick={() => void loadPersistedPrompt()} loading={loading} disabled={saving}>
          重新加载
        </Button>
        <Button onClick={() => void resetToDefaultPrompt()} disabled={saving}>
          恢复当前层默认模板
        </Button>
      </Space>
      {loading ? <Spin size="small" /> : null}
    </Space>
  );
}

function LayerSkillsPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [detailSkillId, setDetailSkillId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const skillMap = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const selectedSkills = useMemo(
    () => selectedSkillIds.map((id) => skillMap.get(id)).filter((x): x is SkillOption => Boolean(x)),
    [selectedSkillIds, skillMap]
  );
  const detailSkill = detailSkillId ? skillMap.get(detailSkillId) ?? null : null;

  const loadSkills = async (): Promise<void> => {
    setLoading(true);
    try {
      const [skillsRes, settings] = await Promise.all([
        requestJson<{ items?: Array<{ id?: string; name?: string; description?: string | null }> }>(
          '/api/v1/skills?page=1&pageSize=100'
        ),
        loadIntentLayerSettings(),
      ]);
      const nextSkills = Array.isArray(skillsRes.items)
        ? skillsRes.items
            .map((row) => ({
              id: String(row.id ?? '').trim(),
              name: String(row.name ?? '').trim(),
              description: row.description ?? null,
            }))
            .filter((row) => row.id && row.name)
        : [];
      setSkills(nextSkills);
      const layer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      const skillIds = Array.isArray(layer?.skillIds)
        ? layer.skillIds.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
      setSelectedSkillIds(skillIds);
      setDetailSkillId(skillIds[0] ?? null);
      setPickerSelectedIds([]);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSkills();
  }, [layerKey]);

  const saveSkills = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveLayerPatch(layerKey, {
        skillIds: selectedSkillIds,
      });
      messageApi.success(`${layerKey.toUpperCase()} Skills 配置已保存`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <Alert
        type="info"
        showIcon
        message="按层绑定 Skills（用于约束该层可调用能力）"
        description="左侧默认展示已配置列表；点击某项可在右侧查看详情。"
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={{ width: '58%', minWidth: 0 }}>
          <Card
            size="small"
            title="已配置 Skills"
            extra={
              <Button size="small" type="primary" onClick={() => setPickerOpen((v) => !v)}>
                {pickerOpen ? '收起新增' : '新增 Skills'}
              </Button>
            }
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {pickerOpen ? (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Select
                    mode="multiple"
                    showSearch
                    filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    placeholder="从 Skills 库中选择要新增的技能"
                    value={pickerSelectedIds}
                    onChange={(v) => setPickerSelectedIds(v)}
                    options={skills
                      .filter((skill) => !selectedSkillIds.includes(skill.id))
                      .map((skill) => ({
                        value: skill.id,
                        label: skill.description ? `${skill.name} - ${skill.description}` : skill.name,
                      }))}
                    loading={loading}
                  />
                  <Space>
                    <Button
                      onClick={() => {
                        const merged = Array.from(new Set([...selectedSkillIds, ...pickerSelectedIds]));
                        setSelectedSkillIds(merged);
                        if (!detailSkillId && merged.length > 0) setDetailSkillId(merged[0]!);
                        setPickerSelectedIds([]);
                        setPickerOpen(false);
                      }}
                      disabled={pickerSelectedIds.length === 0}
                    >
                      添加到已配置列表
                    </Button>
                    <Button
                      onClick={() => {
                        setPickerSelectedIds([]);
                        setPickerOpen(false);
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Space>
              ) : null}
              {selectedSkills.length === 0 ? (
                <Text type="secondary">当前未配置 Skills，请点击「新增 Skills」。</Text>
              ) : (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {selectedSkills.map((skill) => (
                    <div
                      key={skill.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: detailSkillId === skill.id ? '1px solid #1677ff' : '1px solid #f0f0f0',
                        borderRadius: 6,
                        padding: '6px 8px',
                        gap: 8,
                        cursor: 'pointer',
                      }}
                      onClick={() => setDetailSkillId(skill.id)}
                    >
                      <div style={{ minWidth: 0 }}>
                        <Text strong>{skill.name}</Text>
                      </div>
                      <Button
                        size="small"
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSkillIds((prev) => prev.filter((id) => id !== skill.id));
                          setDetailSkillId((prev) => (prev === skill.id ? null : prev));
                        }}
                      >
                        移除
                      </Button>
                    </div>
                  ))}
                </Space>
              )}
            </Space>
          </Card>
        </div>
        <div style={{ width: '42%', minWidth: 0 }}>
          <Card size="small" title="Skills 详情">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="已选数量">
                  <Text strong>{selectedSkillIds.length}</Text>
                </Descriptions.Item>
              </Descriptions>
              {detailSkill ? (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="技能名称">
                    <Text strong>{detailSkill.name}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="技能 ID">
                    <Text code>{detailSkill.id}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="描述">
                    <Text>{detailSkill.description || '暂无描述'}</Text>
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Text type="secondary">请选择左侧一项 Skills 查看详情。</Text>
              )}
            </Space>
          </Card>
        </div>
      </div>
      <Space>
        <Button type="primary" onClick={() => void saveSkills()} loading={saving}>
          保存 Skills 配置
        </Button>
        <Button onClick={() => void loadSkills()} loading={loading} disabled={saving}>
          重新加载
        </Button>
      </Space>
    </Space>
  );
}

function LayerTemperaturePanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState<number>(0.2);

  const loadValue = async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await loadIntentLayerSettings();
      const layer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      const value = typeof layer?.temperature === 'number' ? Math.max(0, Math.min(1, layer.temperature)) : 0.2;
      setTemperature(value);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadValue();
  }, [layerKey]);

  const saveValue = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveLayerPatch(layerKey, { temperature });
      messageApi.success(`${layerKey.toUpperCase()} Temperature 已保存`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <Alert type="info" showIcon message="温度用于控制分配决策的创造性与稳定性平衡" />
      <Slider min={0} max={1} step={0.05} value={temperature} onChange={(v) => setTemperature(v as number)} />
      <InputNumber min={0} max={1} step={0.05} value={temperature} onChange={(v) => setTemperature(Number(v ?? 0))} />
      <Space>
        <Button type="primary" onClick={() => void saveValue()} loading={saving}>
          保存 Temperature
        </Button>
        <Button onClick={() => void loadValue()} loading={loading} disabled={saving}>
          重新加载
        </Button>
      </Space>
    </Space>
  );
}

function LayerMemoryPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enableMemoryRetrieval, setEnableMemoryRetrieval] = useState<boolean>(true);
  const [historyMessagesLimit, setHistoryMessagesLimit] = useState<number>(20);

  const loadValue = async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await loadIntentLayerSettings();
      const layer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      setEnableMemoryRetrieval(typeof layer?.enableMemoryRetrieval === 'boolean' ? layer.enableMemoryRetrieval : true);
      setHistoryMessagesLimit(typeof layer?.historyMessagesLimit === 'number' ? Math.max(1, layer.historyMessagesLimit) : 20);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadValue();
  }, [layerKey]);

  const saveValue = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveLayerPatch(layerKey, {
        enableMemoryRetrieval,
        historyMessagesLimit,
      });
      messageApi.success(`${layerKey.toUpperCase()} Memory 配置已保存`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <Space>
        <Text>启用 Memory 检索</Text>
        <Switch checked={enableMemoryRetrieval} onChange={setEnableMemoryRetrieval} />
      </Space>
      <Space direction="vertical" size={4}>
        <Text>历史消息窗口上限</Text>
        <InputNumber min={1} max={200} value={historyMessagesLimit} onChange={(v) => setHistoryMessagesLimit(Number(v ?? 20))} />
      </Space>
      <Space>
        <Button type="primary" onClick={() => void saveValue()} loading={saving}>
          保存 Memory 配置
        </Button>
        <Button onClick={() => void loadValue()} loading={loading} disabled={saving}>
          重新加载
        </Button>
      </Space>
    </Space>
  );
}

function LayerRulesPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'rules_first' | 'hybrid' | 'llm_assisted'>('hybrid');

  const loadValue = async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await loadIntentLayerSettings();
      const layer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      const nextMode =
        layer?.distributionRuleMode === 'rules_first' ||
        layer?.distributionRuleMode === 'hybrid' ||
        layer?.distributionRuleMode === 'llm_assisted'
          ? layer.distributionRuleMode
          : 'hybrid';
      setMode(nextMode);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadValue();
  }, [layerKey]);

  const saveValue = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveLayerPatch(layerKey, { distributionRuleMode: mode });
      messageApi.success(`${layerKey.toUpperCase()} 分配规则模式已保存`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <Select
        value={mode}
        onChange={(v) => setMode(v)}
        options={[
          { value: 'rules_first', label: 'Rules First（规则优先）' },
          { value: 'hybrid', label: 'Hybrid（规则 + LLM）' },
          { value: 'llm_assisted', label: 'LLM Assisted（LLM主导）' },
        ]}
      />
      <Space>
        <Button type="primary" onClick={() => void saveValue()} loading={saving}>
          保存分配规则模式
        </Button>
        <Button onClick={() => void loadValue()} loading={loading} disabled={saving}>
          重新加载
        </Button>
      </Space>
    </Space>
  );
}

function LayerTimeoutPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState<number>(15000);

  const loadValue = async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await loadIntentLayerSettings();
      const layer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      setTimeoutMs(typeof layer?.timeoutMs === 'number' ? Math.max(1000, layer.timeoutMs) : 15000);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadValue();
  }, [layerKey]);

  const saveValue = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveLayerPatch(layerKey, { timeoutMs });
      messageApi.success(`${layerKey.toUpperCase()} 超时配置已保存`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <InputNumber
        min={1000}
        max={180000}
        step={1000}
        value={timeoutMs}
        onChange={(v) => setTimeoutMs(Number(v ?? 15000))}
        addonAfter="ms"
      />
      <Space>
        <Button type="primary" onClick={() => void saveValue()} loading={saving}>
          保存超时时间
        </Button>
        <Button onClick={() => void loadValue()} loading={loading} disabled={saving}>
          重新加载
        </Button>
      </Space>
    </Space>
  );
}

function LayerSpecialPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [specialText, setSpecialText] = useState<string>('{}');

  const loadValue = async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await loadIntentLayerSettings();
      const layer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      setSpecialText(JSON.stringify(layer?.specialConfig ?? {}, null, 2));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadValue();
  }, [layerKey]);

  const saveValue = async (): Promise<void> => {
    setSaving(true);
    try {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(specialText || '{}') as Record<string, unknown>;
      } catch {
        messageApi.error('特殊配置必须是合法 JSON');
        return;
      }
      await saveLayerPatch(layerKey, { specialConfig: parsed });
      messageApi.success(`${layerKey.toUpperCase()} 特殊配置已保存`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <Input.TextArea rows={12} value={specialText} onChange={(e) => setSpecialText(e.target.value)} />
      <Space>
        <Button type="primary" onClick={() => void saveValue()} loading={saving}>
          保存特殊配置
        </Button>
        <Button onClick={() => void loadValue()} loading={loading} disabled={saving}>
          重新加载
        </Button>
      </Space>
    </Space>
  );
}

function LayerApprovalPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [approvalCostThresholdUsd, setApprovalCostThresholdUsd] = useState<number>(10);
  const [approvalRiskThreshold, setApprovalRiskThreshold] = useState<'low' | 'medium' | 'high' | 'critical'>('high');

  const loadValue = async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await loadIntentLayerSettings();
      const layer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      const special = (layer?.specialConfig ?? {}) as Record<string, unknown>;
      setApprovalCostThresholdUsd(
        typeof special.approvalCostThresholdUsd === 'number' ? Math.max(0, special.approvalCostThresholdUsd) : 10
      );
      setApprovalRiskThreshold(
        special.approvalRiskThreshold === 'low' ||
          special.approvalRiskThreshold === 'medium' ||
          special.approvalRiskThreshold === 'high' ||
          special.approvalRiskThreshold === 'critical'
          ? special.approvalRiskThreshold
          : 'high'
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadValue();
  }, [layerKey]);

  const saveValue = async (): Promise<void> => {
    setSaving(true);
    try {
      const settings = await loadIntentLayerSettings();
      const prevLayer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)] ?? {};
      const prevSpecial = (prevLayer.specialConfig ?? {}) as Record<string, unknown>;
      await saveLayerPatch(layerKey, {
        specialConfig: {
          ...prevSpecial,
          approvalCostThresholdUsd,
          approvalRiskThreshold,
        },
      });
      messageApi.success(`${layerKey.toUpperCase()} 审批阈值已保存`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <Space direction="vertical" size={4}>
        <Text>成本阈值（超过即触发审批）</Text>
        <InputNumber
          min={0}
          step={1}
          value={approvalCostThresholdUsd}
          onChange={(v) => setApprovalCostThresholdUsd(Number(v ?? 10))}
          addonAfter="USD"
        />
      </Space>
      <Space direction="vertical" size={4}>
        <Text>风险等级阈值（达到及以上触发审批）</Text>
        <Select
          value={approvalRiskThreshold}
          onChange={(v) => setApprovalRiskThreshold(v)}
          options={[
            { value: 'low', label: 'low' },
            { value: 'medium', label: 'medium' },
            { value: 'high', label: 'high' },
            { value: 'critical', label: 'critical' },
          ]}
        />
      </Space>
      <Space>
        <Button type="primary" onClick={() => void saveValue()} loading={saving}>
          保存审批阈值
        </Button>
        <Button onClick={() => void loadValue()} loading={loading} disabled={saving}>
          重新加载
        </Button>
      </Space>
    </Space>
  );
}

function LayerCompensationPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [compensationOnTimeout, setCompensationOnTimeout] = useState<'partial_merge' | 'fail_fast'>('partial_merge');
  const [compensationOnDepartmentFailure, setCompensationOnDepartmentFailure] = useState<
    'retry_then_degrade' | 'fail_fast'
  >('retry_then_degrade');
  const [compensationForceVisible, setCompensationForceVisible] = useState<boolean>(true);

  const loadValue = async (): Promise<void> => {
    setLoading(true);
    try {
      const settings = await loadIntentLayerSettings();
      const layer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)];
      const special = (layer?.specialConfig ?? {}) as Record<string, unknown>;
      setCompensationOnTimeout(
        special.compensationOnTimeout === 'fail_fast' ? 'fail_fast' : 'partial_merge'
      );
      setCompensationOnDepartmentFailure(
        special.compensationOnDepartmentFailure === 'fail_fast' ? 'fail_fast' : 'retry_then_degrade'
      );
      setCompensationForceVisible(
        typeof special.compensationForceVisible === 'boolean' ? special.compensationForceVisible : true
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadValue();
  }, [layerKey]);

  const saveValue = async (): Promise<void> => {
    setSaving(true);
    try {
      const settings = await loadIntentLayerSettings();
      const prevLayer = settings.ceoLayers?.[toCanonicalLayerKey(layerKey)] ?? {};
      const prevSpecial = (prevLayer.specialConfig ?? {}) as Record<string, unknown>;
      await saveLayerPatch(layerKey, {
        specialConfig: {
          ...prevSpecial,
          compensationOnTimeout,
          compensationOnDepartmentFailure,
          compensationForceVisible,
          forceFailOnAnyTimeout: compensationOnTimeout === 'fail_fast',
        },
      });
      messageApi.success(`${layerKey.toUpperCase()} 补偿策略已保存`);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {contextHolder}
      <Space direction="vertical" size={4}>
        <Text>Timeout 策略</Text>
        <Select
          value={compensationOnTimeout}
          onChange={(v) => setCompensationOnTimeout(v)}
          options={[
            { value: 'partial_merge', label: 'partial_merge（部分合并）' },
            { value: 'fail_fast', label: 'fail_fast（快速失败）' },
          ]}
        />
      </Space>
      <Space direction="vertical" size={4}>
        <Text>部门失败策略</Text>
        <Select
          value={compensationOnDepartmentFailure}
          onChange={(v) => setCompensationOnDepartmentFailure(v)}
          options={[
            { value: 'retry_then_degrade', label: 'retry_then_degrade（重试后降级）' },
            { value: 'fail_fast', label: 'fail_fast（快速失败）' },
          ]}
        />
      </Space>
      <Space>
        <Text>补偿时强制可见输出</Text>
        <Switch checked={compensationForceVisible} onChange={setCompensationForceVisible} />
      </Space>
      <Space>
        <Button type="primary" onClick={() => void saveValue()} loading={saving}>
          保存补偿策略
        </Button>
        <Button onClick={() => void loadValue()} loading={loading} disabled={saving}>
          重新加载
        </Button>
      </Space>
    </Space>
  );
}

function OutputSchemaPanel({ layerKey }: { layerKey: 'l1' | 'l2' | 'l3' }): ReactElement {
  const [loading, setLoading] = useState(false);
  const [schemaText, setSchemaText] = useState<string>('{}');

  const loadSchema = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await requestJson<{
        layers?: Record<string, { mode?: string; schema?: unknown; note?: string }>;
      }>('/api/v1/admin/platform-settings/ceo-pipeline-output-schema');
      const layerPayload = response.layers?.[layerKey] ?? {};
      setSchemaText(
        JSON.stringify(
          {
            layer: layerKey,
            ...layerPayload,
          },
          null,
          2,
        ),
      );
    } catch {
      setSchemaText(JSON.stringify({ layer: layerKey, error: 'failed_to_load_schema' }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSchema();
  }, [layerKey]);

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      <div style={{ width: '66.6667%', minWidth: 0 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="输出格式协议面板（只读）"
            description="本面板加载 CEO 管线 L1/L2/L3 参考 JSON（ceo-pipeline-output-schema）。前置 IntentLayer 说明见 intent-layer-output-schema。"
          />
          <Card size="small" title="协议概览">
            <Paragraph style={{ marginBottom: 8 }}>
              <Text strong>模式：</Text>
              Structured Output / Strict JSON
            </Paragraph>
            <Paragraph style={{ marginBottom: 0 }}>
              <Text strong>配置状态：</Text>
              协议由后端接口实时返回，本页面不直接修改协议结构。
            </Paragraph>
          </Card>
          <Card size="small" title="失败处理">
            <Paragraph style={{ marginBottom: 0 }}>
              若模型输出不符合协议，系统会自动进入 fallback 规则规划，保障链路可用性。
            </Paragraph>
          </Card>
          <Card size="small" title="调试建议">
            <Paragraph style={{ marginBottom: 0 }}>
              如需调整输出行为，请优先修改 System Prompt 的约束表达，保持字段集合与 JSON 结构不变。
            </Paragraph>
          </Card>
        </Space>
      </div>
      <div style={{ width: '33.3333%', minWidth: 0 }}>
        <Card
          size="small"
          title="JSON 协议（后端实时）"
          extra={
            <Button size="small" onClick={() => void loadSchema()} loading={loading}>
              刷新
            </Button>
          }
          style={{ height: '100%' }}
        >
          <Input.TextArea readOnly rows={16} value={schemaText} />
        </Card>
      </div>
    </div>
  );
}

function LayerConfigSection({
  title,
  description,
  dataSource,
  layerKey
}: {
  title: string;
  description: string;
  dataSource: LayerItem[];
  layerKey: 'l1' | 'l2' | 'l3';
}): ReactElement {
  return (
    <Card variant="borderless" className="erp-market-table-card" style={{ marginBottom: 16 }}>
      <Title level={5} style={{ marginTop: 0 }}>
        {title}
      </Title>
      <Paragraph type="secondary">{description}</Paragraph>
      <Tabs
        items={dataSource.map((item) => ({
          key: item.key,
          label: item.name,
          children: (
            <Card size="small">
              {item.key === 'model' ? (
                <ModelSelectorPanel layerKey={layerKey} />
              ) : item.key === 'skills' ? (
                <LayerSkillsPanel layerKey={layerKey} />
              ) : item.key === 'prompt' ? (
                <SystemPromptPanel layerKey={layerKey} />
              ) : item.key === 'output' ? (
                <OutputSchemaPanel layerKey={layerKey} />
              ) : item.key === 'temperature' ? (
                <LayerTemperaturePanel layerKey={layerKey} />
              ) : item.key === 'memory' ? (
                <LayerMemoryPanel layerKey={layerKey} />
              ) : item.key === 'rules' ? (
                <LayerRulesPanel layerKey={layerKey} />
              ) : item.key === 'timeout' ? (
                <LayerTimeoutPanel layerKey={layerKey} />
              ) : item.key === 'special' ? (
                <LayerSpecialPanel layerKey={layerKey} />
              ) : item.key === 'approval' ? (
                <LayerApprovalPanel layerKey={layerKey} />
              ) : item.key === 'compensation' ? (
                <LayerCompensationPanel layerKey={layerKey} />
              ) : (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="配置项">
                    <Text>{item.name}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="建议值">
                    <Text strong>{item.recommendation}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="说明">
                    <Text>{item.detail}</Text>
                  </Descriptions.Item>
                </Descriptions>
              )}
            </Card>
          )
        }))}
      />
    </Card>
  );
}

function CeoLayerConfigPanel({ config }: { config: LayerConfig }): ReactElement {
  return (
    <div className="erp-ceo-tab-content">
      <Alert type={config.alertType} showIcon style={{ marginBottom: 16 }} message={config.alertMessage} />
      <LayerConfigSection
        title={config.title}
        description={config.description}
        dataSource={config.items}
        layerKey={config.key}
      />
      <Card variant="borderless" className="erp-market-table-card">
        <Title level={5} style={{ marginTop: 0 }}>
          温度建议区间（可视化）
        </Title>
        <Slider
          range
          min={0}
          max={1}
          step={0.1}
          value={config.temperatureRange}
          tooltip={{ open: false }}
          disabled
        />
      </Card>
    </div>
  );
}

const LAYER_CONFIGS: Record<'l1' | 'l2' | 'l3', LayerConfig> = {
  l1: {
    key: 'l1',
    title: 'L1 战略层（Strategy & Planning Layer）',
    description: '负责战略判断、目标规划与方向校准。该层对模型质量和上下文完整度要求最高。',
    alertType: 'info',
    alertMessage: 'L1 战略层是 CEO 核心智慧层，建议默认开启高质量模型与审批保护。',
    temperatureRange: [0.3, 0.7],
    items: [
      {
        key: 'model',
        name: '模型',
        recommendation: '强模型（必须）',
        detail: '优先 Claude 3.5 Sonnet / GPT-4o / Grok 3，用于复杂战略推理和长期规划。'
      },
      {
        key: 'prompt',
        name: 'System Prompt',
        recommendation: '战略思考 Prompt',
        detail: '强调“像顶级战略顾问一样思考”，并要求输出结构化 PlanningResult。'
      },
      {
        key: 'skills',
        name: 'Skills',
        recommendation: '按层绑定能力集',
        detail: '从技能库选择该层可使用的 Skills，约束执行能力边界。'
      },
      {
        key: 'temperature',
        name: 'Temperature',
        recommendation: '0.3 ~ 0.7',
        detail: '保持适度创造性，避免过度发散，同时保证可执行性。'
      },
      {
        key: 'output',
        name: '输出格式',
        recommendation: 'Structured Output (JSON Schema)',
        detail: '强制输出 PlanningResult，方便后续 L2/L3 直接消费。'
      },
      {
        key: 'memory',
        name: 'Memory 检索',
        recommendation: '公司级 + 历史战略记忆',
        detail: '检索范围可设置为较高 topK，覆盖战略上下文、历史结果与复盘。'
      },
      {
        key: 'approval',
        name: '审批阈值',
        recommendation: 'needsHumanApproval 规则',
        detail: '预算、风险等级、战略变更触发人工审批，避免高风险自动执行。'
      },
      {
        key: 'timeout',
        name: '超时时间',
        recommendation: '15s ~ 30s',
        detail: '允许深度思考，适配复杂规划任务。'
      },
      {
        key: 'special',
        name: '特殊配置',
        recommendation: '风险权重 / OKR 模板',
        detail: '支持后台动态调整，匹配不同企业管理风格。'
      }
    ]
  },
  l2: {
    key: 'l2',
    title: 'L2 协调层（Orchestration & Distribution Layer）',
    description: '负责任务拆分、分发和并行调度。重点是高效分配与负载均衡。',
    alertType: 'success',
    alertMessage: 'L2 协调层是效率中枢，建议优先保证分配速度与可解释性。',
    temperatureRange: [0.1, 0.4],
    items: [
      {
        key: 'model',
        name: '模型',
        recommendation: '中轻模型',
        detail: '推荐 GPT-4o-mini / Claude 3 Haiku / Qwen2.5-32B，平衡成本、速度与质量。'
      },
      {
        key: 'prompt',
        name: 'System Prompt',
        recommendation: '任务拆分与分配 Prompt',
        detail: '强调公平、高效、考虑部门负载，减少局部最优决策。'
      },
      {
        key: 'skills',
        name: 'Skills',
        recommendation: '分配与编排技能集',
        detail: '从技能库选择 L2 可调用能力，控制分配策略与执行路径。'
      },
      {
        key: 'temperature',
        name: 'Temperature',
        recommendation: '0.1 ~ 0.4',
        detail: '低温度保证稳定拆分与可预测分配结果。'
      },
      {
        key: 'output',
        name: '输出格式',
        recommendation: 'Structured Output',
        detail: '统一输出 DistributionPlan，供调度器和执行层直接使用。'
      },
      {
        key: 'memory',
        name: 'Memory 检索',
        recommendation: '部门负载 + 历史分配记录',
        detail: '重点检索当前部门状态，避免持续超载和任务倾斜。'
      },
      {
        key: 'rules',
        name: '分配规则',
        recommendation: '规则引擎 + LLM 辅助',
        detail: '可配置部门优先级、负载均衡策略，并支持混合决策。'
      },
      {
        key: 'timeout',
        name: '超时时间',
        recommendation: '8s ~ 15s',
        detail: '强调快速决策，防止上游规划结果阻塞执行流。'
      },
      {
        key: 'special',
        name: '特殊配置',
        recommendation: '并行策略 / 部门偏好',
        detail: '支持后台定义某部门优先 Agent 类型（如 Marketing 优先增长型 Agent）。'
      }
    ]
  },
  l3: {
    key: 'l3',
    title: 'L3 监督层（Execution Supervision & Merge Layer）',
    description: '负责执行监控、结果合并与管理汇报。核心是稳定、可观测、可降级。',
    alertType: 'warning',
    alertMessage: 'L3 监督层关注可观测性与可交付性，建议优先保证稳定性和降级能力。',
    temperatureRange: [0, 0.3],
    items: [
      {
        key: 'model',
        name: '模型',
        recommendation: '轻模型（可配置）',
        detail: '推荐 GPT-4o-mini 或更低成本模型，极端情况下可退化到规则引擎。'
      },
      {
        key: 'prompt',
        name: 'System Prompt',
        recommendation: '总结与汇报 Prompt',
        detail: '强调客观、结构化、老板视角，便于管理层快速判断。'
      },
      {
        key: 'skills',
        name: 'Skills',
        recommendation: '监督与合并技能集',
        detail: '从技能库选择 L3 监督层可用能力，统一补偿与汇总行为。'
      },
      {
        key: 'temperature',
        name: 'Temperature',
        recommendation: '0.0 ~ 0.3',
        detail: '保持稳定一致输出，降低风格波动。'
      },
      {
        key: 'output',
        name: '输出格式',
        recommendation: 'Structured Output',
        detail: '输出 HeavyExecutionOutput，支持结果汇总与后续审计。'
      },
      {
        key: 'memory',
        name: 'Memory 检索',
        recommendation: '全量执行记录',
        detail: '用于最终合并、经验沉淀、后续记忆回放与复盘。'
      },
      {
        key: 'compensation',
        name: '补偿策略',
        recommendation: '超时 / 失败处理规则',
        detail: '支持配置“超时后强制可见”“部分失败降级输出”等策略。'
      },
      {
        key: 'timeout',
        name: '超时时间',
        recommendation: '依赖子任务完成时间',
        detail: '该层主要等待子流程结束，整体超时应与执行链路协同配置。'
      },
      {
        key: 'special',
        name: '特殊配置',
        recommendation: 'Partial Update 频率 / 汇报风格',
        detail: '支持后台调整中间进度可见频率，满足管理者个性化偏好。'
      }
    ]
  }
};

export function CeoL1StrategyConfigTab(): ReactElement {
  return <CeoLayerConfigPanel config={LAYER_CONFIGS.l1} />;
}

export function CeoL2CoordinationConfigTab(): ReactElement {
  return <CeoLayerConfigPanel config={LAYER_CONFIGS.l2} />;
}

export function CeoL3SupervisionConfigTab(): ReactElement {
  return <CeoLayerConfigPanel config={LAYER_CONFIGS.l3} />;
}
