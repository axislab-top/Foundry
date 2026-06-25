import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Typography,
  message
} from 'antd';
import { adminAuthedRequestJson } from '../../../shared/api/client';
import { CatalogWorkspace } from './components/CatalogWorkspace';
import { PlatformModelsHeader } from './components/PlatformModelsHeader';
import { PlatformModelsStats } from './components/PlatformModelsStats';
import {
  DEFAULT_SUFFIX_BY_MODEL_TYPE,
  EMBEDDING_PATH_OPTIONS,
  EMBEDDING_PATH_TEXT,
  EMBEDDING_PATH_MULTIMODAL,
  MODEL_TYPE_OPTIONS
} from './constants';
import type {
  ApiLlmKeyPoolGroup,
  ApiLlmModel,
  ApiLlmProvider,
  KeyStatus,
  ModelType,
  PlatformEmbeddingSetting,
  ProviderGroup
} from './types';
import { BILLING_CREDIT_RATE_HINT } from '../../billing/constants';
import {
  buildProviderGroups,
  catalogCreditsPerMillionToFormYuan,
  catalogPriceRules,
  mapModelPricingFormToApiPayload,
  isEmbeddingPathStandard
} from './utils';

export default function PlatformModelsKeysPage(): ReactElement {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [searchValue, setSearchValue] = useState('');
  const [providers, setProviders] = useState<ApiLlmProvider[]>([]);
  const [models, setModels] = useState<ApiLlmModel[]>([]);
  const [groups, setGroups] = useState<ApiLlmKeyPoolGroup[]>([]);
  const [embeddingSetting, setEmbeddingSetting] = useState<PlatformEmbeddingSetting>({
    defaultEmbeddingModelId: null,
    effective: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeKeyActionId, setActiveKeyActionId] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [editProviderOpen, setEditProviderOpen] = useState(false);
  const [editModelOpen, setEditModelOpen] = useState(false);
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<{ id: string; alias: string } | null>(null);
  const [embeddingModelModalOpen, setEmbeddingModelModalOpen] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [editingProviderCode, setEditingProviderCode] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [deletingProvider, setDeletingProvider] = useState(false);
  const [deletingModel, setDeletingModel] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [providerForm] = Form.useForm<{
    code: string;
    displayName?: string;
    kind: 'openai' | 'anthropic';
    requestUrl: string;
  }>();
  const [modelForm] = Form.useForm<{
    providerCode: string;
    modelName: string;
    modelType: ModelType;
    requestPathSuffix?: string;
    embeddingDimensions?: number | null;
    isActive: boolean;
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
    embeddingPricePerMillion?: number;
  }>();
  const [newKeyForm] = Form.useForm<{
    keyAlias: string;
    secret: string;
    dailyQuotaTokens: number;
    isActive: boolean;
  }>();
  const [rotateForm] = Form.useForm<{ secret: string }>();
  const [embeddingModelForm] = Form.useForm<{ defaultEmbeddingModelId: string | null }>();
  const [editProviderForm] = Form.useForm<{
    displayName?: string;
    kind: 'openai' | 'anthropic';
    requestUrl: string;
  }>();
  const [editModelForm] = Form.useForm<{
    modelType?: string;
    requestPathSuffix?: string;
    embeddingDimensions?: number | null;
    isActive: boolean;
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
    embeddingPricePerMillion?: number;
  }>();

  const loadData = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [providersRes, modelsRes, keysRes, embeddingSettingRes] = await Promise.all([
        adminAuthedRequestJson<{ items?: ApiLlmProvider[] }>('/api/admin/llm-providers'),
        adminAuthedRequestJson<{ items?: ApiLlmModel[] }>('/api/admin/llm-models'),
        adminAuthedRequestJson<{ groups?: ApiLlmKeyPoolGroup[] }>('/api/admin/llm-keys/grouped'),
        adminAuthedRequestJson<PlatformEmbeddingSetting>(
          '/api/v1/admin/platform-settings/memory-default-embedding-model'
        )
      ]);
      setProviders(providersRes.items ?? []);
      setModels(modelsRes.items ?? []);
      setGroups(keysRes.groups ?? []);
      setEmbeddingSetting({
        defaultEmbeddingModelId: embeddingSettingRes.defaultEmbeddingModelId ?? null,
        effective: embeddingSettingRes.effective ?? null
      });
    } catch (err) {
      const nextError = err instanceof Error ? err.message : String(err);
      setError(nextError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const providerGroups = useMemo<ProviderGroup[]>(
    () => buildProviderGroups(providers, models, groups),
    [groups, models, providers]
  );

  const normalizedSearch = searchValue.trim().toLowerCase();

  const filteredProviders = useMemo(() => {
    if (!normalizedSearch) return providerGroups;
    return providerGroups.filter((provider) => {
      if (provider.name.toLowerCase().includes(normalizedSearch)) return true;
      return provider.models.some((model) => {
        if (model.name.toLowerCase().includes(normalizedSearch)) return true;
        return model.keys.some((key) => key.alias.toLowerCase().includes(normalizedSearch));
      });
    });
  }, [normalizedSearch, providerGroups]);

  const selectedProvider =
    filteredProviders.find((provider) => provider.id === selectedProviderId) ?? filteredProviders[0];

  const selectedModel =
    selectedProvider?.models.find((model) => model.id === selectedModelId) ?? selectedProvider?.models[0];
  const selectedModelRecord = useMemo(
    () =>
      models.find((item) => item.id === selectedModel?.id) ??
      models.find(
        (item) => item.providerCode === selectedProvider?.id && item.modelName === selectedModel?.name
      ),
    [models, selectedModel?.id, selectedModel?.name, selectedProvider?.id]
  );

  useEffect(() => {
    if (!selectedProvider && filteredProviders.length > 0) {
      setSelectedProviderId(filteredProviders[0].id);
    }
  }, [filteredProviders, selectedProvider]);

  useEffect(() => {
    if (!selectedModel && selectedProvider?.models.length) {
      setSelectedModelId(selectedProvider.models[0].id);
    }
  }, [selectedModel, selectedProvider]);

  useEffect(() => {
    setSelectedKeyId(null);
  }, [selectedModelId]);

  const stats = useMemo(() => {
    const models = filteredProviders.flatMap((provider) => provider.models);
    const keys = models.flatMap((model) => model.keys);
    const activeKeys = keys.filter((key) => key.status === 'active').length;
    return {
      providerCount: filteredProviders.length,
      modelCount: models.length,
      keyCount: keys.length,
      activeKeys
    };
  }, [filteredProviders]);

  const effectiveEmbeddingModelName = useMemo(() => {
    const effectiveId = embeddingSetting.effective?.trim();
    if (!effectiveId) return '未配置';
    const effectiveModel = models.find((item) => item.id === effectiveId);
    if (effectiveModel?.modelName?.trim()) {
      return effectiveModel.modelName.trim();
    }
    if (embeddingSetting.defaultEmbeddingModelId === effectiveId) {
      return `${effectiveId}（未在当前模型列表）`;
    }
    return '未配置';
  }, [embeddingSetting.defaultEmbeddingModelId, embeddingSetting.effective, models]);

  const effectiveEmbeddingSubtitle = useMemo(() => {
    const effectiveId = embeddingSetting.effective?.trim();
    if (!effectiveId) return '请在下方选择默认向量模型，并与部署环境 MEMORY_EMBEDDING_DIMENSIONS 一致。';
    const m = models.find((item) => item.id === effectiveId);
    if (!m || m.modelType !== 'embedding') return null;
    const path = String(m.requestPathSuffix ?? '').trim() || '—';
    const dim =
      typeof m.embeddingDimensions === 'number' && m.embeddingDimensions > 0
        ? `${m.embeddingDimensions}`
        : /\bembedding-vision\b/i.test(m.modelName)
          ? '未填库表（运行时推断 2048）'
          : '未配置（依赖 MEMORY_EMBEDDING_DIMENSIONS）';
    return `路径: ${path} · 维度: ${dim}`;
  }, [embeddingSetting.effective, models]);

  const embeddingModelOptions = useMemo(
    () =>
      models
        .filter((item) => item.modelType === 'embedding' && item.isActive)
        .map((item) => {
          const p = String(item.requestPathSuffix ?? '').trim();
          const pathTag =
            p === EMBEDDING_PATH_MULTIMODAL ? '多模态' : p === EMBEDDING_PATH_TEXT ? '文本' : p || '路径未填';
          const dim =
            typeof item.embeddingDimensions === 'number' && item.embeddingDimensions > 0
              ? `${item.embeddingDimensions}维`
              : '';
          return {
            label: `${item.modelName} (${item.providerCode}) · ${pathTag}${dim ? ` · ${dim}` : ''}`,
            value: item.id
          };
        }),
    [models]
  );

  const openEditProvider = (provider: ProviderGroup): void => {
    const providerMeta = providers.find((item) => item.code === provider.id);
    editProviderForm.setFieldsValue({
      displayName: providerMeta?.displayName ?? provider.name,
      kind: providerMeta?.kind ?? 'openai',
      requestUrl: providerMeta?.requestUrl ?? ''
    });
    setEditingProviderCode(provider.id);
    setEditProviderOpen(true);
  };

  const openEditModel = (modelId: string): void => {
    const modelRecord = models.find((item) => item.id === modelId);
    const cp = modelRecord?.catalogPricing;
    editModelForm.setFieldsValue({
      modelType: modelRecord?.modelType ?? '',
      requestPathSuffix: modelRecord?.requestPathSuffix ?? '',
      embeddingDimensions:
        typeof modelRecord?.embeddingDimensions === 'number'
          ? modelRecord.embeddingDimensions
          : undefined,
      isActive: modelRecord?.isActive ?? true,
      inputPricePerMillion: catalogCreditsPerMillionToFormYuan(cp?.inputPricePerMillion),
      outputPricePerMillion: catalogCreditsPerMillionToFormYuan(cp?.outputPricePerMillion),
      embeddingPricePerMillion: catalogCreditsPerMillionToFormYuan(cp?.embeddingPricePerMillion)
    });
    setEditingModelId(modelId);
    setEditModelOpen(true);
  };

  const confirmRevokeKey = (keyId: string): void => {
    Modal.confirm({
      title: '确认吊销此密钥？',
      content: '吊销后无法恢复，依赖该密钥的 Agent 将需要重新绑定。',
      okText: '吊销',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => removeKey(keyId)
    });
  };

  const updateKeyStatus = async (keyId: string, nextStatus: KeyStatus): Promise<void> => {
    setActiveKeyActionId(keyId);
    try {
      await adminAuthedRequestJson(`/api/admin/llm-keys/${keyId}/${nextStatus === 'active' ? 'enable' : 'disable'}`, {
        method: 'POST'
      });
      messageApi.success(nextStatus === 'active' ? '密钥已启用' : '密钥已停用');
      await loadData();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setActiveKeyActionId(null);
    }
  };

  const removeKey = async (keyId: string): Promise<void> => {
    setActiveKeyActionId(keyId);
    try {
      await adminAuthedRequestJson(`/api/admin/llm-keys/${keyId}`, { method: 'DELETE' });
      messageApi.success('密钥已吊销');
      await loadData();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setActiveKeyActionId(null);
    }
  };

  const submitAddProvider = async (): Promise<void> => {
    try {
      const payload = await providerForm.validateFields();
      setSubmitting(true);
      await adminAuthedRequestJson('/api/admin/llm-providers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      messageApi.success('供应商已创建');
      setAddProviderOpen(false);
      providerForm.resetFields();
      await loadData();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitAddModel = async (): Promise<void> => {
    try {
      const values = await modelForm.validateFields();
      setSubmitting(true);
      const pricing = mapModelPricingFormToApiPayload(values);
      await adminAuthedRequestJson('/api/admin/llm-models', {
        method: 'POST',
        body: JSON.stringify({ ...values, ...pricing }),
      });
      messageApi.success('模型已创建');
      setAddModelOpen(false);
      modelForm.resetFields();
      await loadData();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitEditProvider = async (): Promise<void> => {
    if (!editingProviderCode) return;
    try {
      const payload = await editProviderForm.validateFields();
      setSubmitting(true);
      await adminAuthedRequestJson(`/api/admin/llm-providers/${editingProviderCode}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      messageApi.success('供应商已更新');
      setEditProviderOpen(false);
      setEditingProviderCode(null);
      await loadData();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitEditModel = async (): Promise<void> => {
    if (!editingModelId) return;
    try {
      const values = await editModelForm.validateFields();
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        requestPathSuffix: values.requestPathSuffix,
        isActive: values.isActive,
        ...mapModelPricingFormToApiPayload(values),
      };
      if (String(values.modelType ?? '') === 'embedding') {
        const ed = values.embeddingDimensions;
        if (typeof ed === 'number' && Number.isFinite(ed)) {
          payload.embeddingDimensions = ed;
        } else {
          payload.embeddingDimensions = null;
        }
      }
      await adminAuthedRequestJson(`/api/admin/llm-models/${editingModelId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      messageApi.success('模型已更新');
      setEditModelOpen(false);
      setEditingModelId(null);
      await loadData();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const removeProvider = async (): Promise<void> => {
    if (!editingProviderCode) return;
    try {
      setDeletingProvider(true);
      await adminAuthedRequestJson(`/api/admin/llm-providers/${editingProviderCode}`, {
        method: 'DELETE'
      });
      messageApi.success('供应商已删除');
      setEditProviderOpen(false);
      setEditingProviderCode(null);
      editProviderForm.resetFields();
      await loadData();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingProvider(false);
    }
  };

  const removeModel = async (): Promise<void> => {
    if (!editingModelId) return;
    try {
      setDeletingModel(true);
      await adminAuthedRequestJson(`/api/admin/llm-models/${editingModelId}`, {
        method: 'DELETE'
      });
      messageApi.success('模型已删除');
      setEditModelOpen(false);
      setEditingModelId(null);
      editModelForm.resetFields();
      await loadData();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingModel(false);
    }
  };

  const submitNewKey = async (): Promise<void> => {
    if (!selectedProvider || !selectedModel) {
      messageApi.warning('请先选择供应商与模型');
      return;
    }
    try {
      const values = await newKeyForm.validateFields();
      setSubmitting(true);
      await adminAuthedRequestJson('/api/admin/llm-keys', {
        method: 'POST',
        body: JSON.stringify({
          llmModelId: selectedModelRecord?.id,
          provider: selectedProvider.id,
          modelName: selectedModel.name,
          ...values
        })
      });
      messageApi.success('密钥已创建');
      setNewKeyOpen(false);
      newKeyForm.resetFields();
      await loadData();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const testExistingKey = async (keyId: string): Promise<void> => {
    try {
      setTestingKeyId(keyId);
      const result = await adminAuthedRequestJson<{
        ok: boolean;
        message: string;
        httpStatus?: number;
      }>(`/api/admin/llm-keys/${keyId}/test`, {
        method: 'POST',
      });
      if (result.ok) {
        messageApi.success(result.message || '密钥测试通过');
      } else {
        messageApi.error(result.message || '密钥测试失败');
      }
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingKeyId(null);
    }
  };

  const submitRotate = async (): Promise<void> => {
    if (!rotateTarget) return;
    try {
      const values = await rotateForm.validateFields();
      setSubmitting(true);
      await adminAuthedRequestJson(`/api/admin/llm-keys/${rotateTarget.id}/rotate`, {
        method: 'POST',
        body: JSON.stringify(values)
      });
      messageApi.success('密钥已轮换');
      setRotateTarget(null);
      rotateForm.resetFields();
      await loadData();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitEmbeddingModel = async (): Promise<void> => {
    try {
      const values = await embeddingModelForm.validateFields();
      setSubmitting(true);
      const modelId = values.defaultEmbeddingModelId || null;
      const result = await adminAuthedRequestJson<PlatformEmbeddingSetting>(
        '/api/v1/admin/platform-settings/memory-default-embedding-model',
        {
          method: 'PATCH',
          body: JSON.stringify({ defaultEmbeddingModelId: modelId })
        }
      );
      setEmbeddingSetting({
        defaultEmbeddingModelId: result.defaultEmbeddingModelId ?? null,
        effective: result.effective ?? null
      });
      messageApi.success('默认向量模型已更新');
      setEmbeddingModelModalOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openEmbeddingModal = (): void => {
    embeddingModelForm.setFieldsValue({
      defaultEmbeddingModelId: embeddingSetting.defaultEmbeddingModelId
    });
    setEmbeddingModelModalOpen(true);
  };

  const openAddModel = (): void => {
    modelForm.resetFields();
    modelForm.setFieldsValue({
      providerCode: selectedProvider?.id,
      modelType: 'chat',
      requestPathSuffix: DEFAULT_SUFFIX_BY_MODEL_TYPE.chat,
      isActive: true
    });
    setAddModelOpen(true);
  };

  return (
    <div className="erp-llm-page">
      {messageContextHolder}
      <PlatformModelsHeader
        searchValue={searchValue}
        loading={loading}
        onSearchChange={setSearchValue}
        onRefresh={() => void loadData()}
        onAddProvider={() => setAddProviderOpen(true)}
      />

      {error ? (
        <Alert type="error" showIcon title="加载模型目录失败" description={error} />
      ) : null}

      <PlatformModelsStats
        stats={stats}
        effectiveEmbeddingModelName={effectiveEmbeddingModelName}
        effectiveEmbeddingSubtitle={effectiveEmbeddingSubtitle}
        onConfigureEmbedding={openEmbeddingModal}
      />

      <CatalogWorkspace
        loading={loading}
        providers={filteredProviders}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        selectedProviderId={selectedProvider?.id}
        selectedModelId={selectedModel?.id}
        selectedKeyId={selectedKeyId}
        activeKeyActionId={activeKeyActionId}
        testingKeyId={testingKeyId}
        onSelectProvider={(providerId, firstModelId) => {
          setSelectedProviderId(providerId);
          setSelectedModelId(firstModelId);
        }}
        onSelectModel={setSelectedModelId}
        onSelectKey={setSelectedKeyId}
        onEditProvider={openEditProvider}
        onAddModel={openAddModel}
        onEditModel={(model) => openEditModel(model.id)}
        onNewKey={() => {
          if (!selectedModel) {
            messageApi.warning('请先选择模型');
            return;
          }
          newKeyForm.setFieldsValue({ dailyQuotaTokens: 0, isActive: true });
          setNewKeyOpen(true);
        }}
        onRotateSelected={() => {
          const key = selectedModel?.keys.find((item) => item.id === selectedKeyId);
          if (key) setRotateTarget({ id: key.id, alias: key.alias });
        }}
        onUpdateKeyStatus={(keyId, status) => void updateKeyStatus(keyId, status)}
        onRotateKey={(key) => {
          rotateForm.resetFields();
          setRotateTarget({ id: key.id, alias: key.alias });
        }}
        onTestKey={(keyId) => void testExistingKey(keyId)}
        onRevokeKey={confirmRevokeKey}
      />

      <Modal
        title="新建供应商"
        open={addProviderOpen}
        onCancel={() => setAddProviderOpen(false)}
        onOk={() => void submitAddProvider()}
        okText="创建"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={providerForm} layout="vertical" initialValues={{ kind: 'openai' }}>
          <Form.Item name="code" label="供应商代码" rules={[{ required: true, message: '请填写供应商代码' }]}>
            <Input placeholder="openai-compatible" maxLength={32} />
          </Form.Item>
          <Form.Item name="displayName" label="Display Name">
            <Input placeholder="OpenAI Compatible" maxLength={120} />
          </Form.Item>
          <Form.Item name="kind" label="Kind" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'OpenAI', value: 'openai' },
                { label: 'Anthropic', value: 'anthropic' }
              ]}
            />
          </Form.Item>
          <Form.Item
            name="requestUrl"
            label="Request URL"
            rules={[{ required: true, message: 'Request URL is required' }]}
          >
            <Input placeholder="https://api.openai.com/v1" maxLength={2048} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建模型"
        open={addModelOpen}
        onCancel={() => setAddModelOpen(false)}
        onOk={() => void submitAddModel()}
        okText="Create"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form
          form={modelForm}
          layout="vertical"
          initialValues={{ modelType: 'chat', isActive: true }}
          onValuesChange={(changedValues) => {
            if ('modelType' in changedValues) {
              const modelType = changedValues.modelType as ModelType | undefined;
              if (!modelType) return;
              const currentSuffix = String(modelForm.getFieldValue('requestPathSuffix') ?? '').trim();
              const defaults = new Set(Object.values(DEFAULT_SUFFIX_BY_MODEL_TYPE).filter(Boolean));
              const embeddingStd = new Set([EMBEDDING_PATH_TEXT, EMBEDDING_PATH_MULTIMODAL]);
              if (
                !currentSuffix ||
                defaults.has(currentSuffix) ||
                (modelType === 'embedding' && embeddingStd.has(currentSuffix))
              ) {
                modelForm.setFieldValue('requestPathSuffix', DEFAULT_SUFFIX_BY_MODEL_TYPE[modelType]);
              }
              if (modelType === 'embedding') {
                const name = String(modelForm.getFieldValue('modelName') ?? '');
                if (/\bembedding-vision\b/i.test(name)) {
                  modelForm.setFieldValue('embeddingDimensions', 2048);
                }
              }
            }
            if ('modelName' in changedValues && modelForm.getFieldValue('modelType') === 'embedding') {
              const n = String(changedValues.modelName ?? '');
              if (/\bembedding-vision\b/i.test(n)) {
                const cur = modelForm.getFieldValue('embeddingDimensions');
                if (cur === undefined || cur === null) {
                  modelForm.setFieldValue('embeddingDimensions', 2048);
                }
              }
            }
          }}
        >
          <Form.Item
            name="providerCode"
            label="Provider"
            rules={[{ required: true, message: 'Provider is required' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={providers.map((provider) => ({
                label: provider.displayName || provider.code,
                value: provider.code
              }))}
            />
          </Form.Item>
          <Form.Item name="modelName" label="Model Name" rules={[{ required: true, message: 'Model name is required' }]}>
            <Input placeholder="gpt-4.1 / doubao-embedding-vision-251215" maxLength={120} />
          </Form.Item>
          <Form.Item name="modelType" label="Model Type" rules={[{ required: true }]}>
            <Select options={MODEL_TYPE_OPTIONS.map((value) => ({ label: value, value }))} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.modelType !== cur.modelType}>
            {() =>
              modelForm.getFieldValue('modelType') === 'embedding' ? (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="向量模型 API 路径"
                    description="平台 Memory 与 RAG 为纯文本：请优先选「文本向量」。仅当模型必须走多模态接口（图文联合）时再选「多模态向量」。"
                  />
                  <Form.Item
                    name="requestPathSuffix"
                    label="Embedding 请求路径"
                    rules={[{ required: true, message: '请选择向量 API 类型' }]}
                  >
                    <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {EMBEDDING_PATH_OPTIONS.map((opt) => (
                        <Radio key={opt.value} value={opt.value}>
                          <div>
                            <Typography.Text strong>{opt.label}</Typography.Text>
                            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 2 }}>
                              {opt.desc}
                            </Typography.Paragraph>
                          </div>
                        </Radio>
                      ))}
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item
                    name="embeddingDimensions"
                    label="向量维度"
                    tooltip="须与接口返回长度一致，并与 MEMORY_EMBEDDING_DIMENSIONS 一致。名称含 embedding-vision 时会自动建议 2048。"
                  >
                    <InputNumber min={256} max={8192} step={128} placeholder="可选，如 2048" style={{ width: '100%' }} />
                  </Form.Item>
                </Space>
              ) : (
                <Form.Item name="requestPathSuffix" label="Request Path Suffix">
                  <Input placeholder="/chat/completions" />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.modelType !== cur.modelType}>
            {() =>
              modelForm.getFieldValue('modelType') === 'embedding' ? (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="平台计费（model_pricing）"
                    description="向量调用按「每百万 token」单价入账（billing recordType=embedding）。与任意绑定该 modelName 的 Agent 共用此目录价；单价可为 0（免费）。"
                  />
                  <Form.Item
                    name="embeddingPricePerMillion"
                    label="Embedding 单价 (¥/百万 tokens)"
                    rules={catalogPriceRules('Embedding 单价')}
                  >
                    <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="必填；0 表示免费" />
                  </Form.Item>
                </Space>
              ) : (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="平台计费（model_pricing）"
                    description={`按模型名写入平台目录价：表单填人民币/百万 tokens，API 按 Credit 入账（${BILLING_CREDIT_RATE_HINT}）。单价可为 0（免费）。`}
                  />
                  <Form.Item
                    name="inputPricePerMillion"
                    label="Input 单价 (¥/百万 tokens)"
                    rules={catalogPriceRules('Input 单价')}
                  >
                    <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="必填；0 表示免费" />
                  </Form.Item>
                  <Form.Item
                    name="outputPricePerMillion"
                    label="Output 单价 (¥/百万 tokens)"
                    rules={catalogPriceRules('Output 单价')}
                  >
                    <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="必填；0 表示免费" />
                  </Form.Item>
                </Space>
              )
            }
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`编辑供应商${editingProviderCode ? `：${editingProviderCode}` : ''}`}
        open={editProviderOpen}
        onCancel={() => {
          setEditProviderOpen(false);
          setEditingProviderCode(null);
          editProviderForm.resetFields();
        }}
        onOk={() => void submitEditProvider()}
        okText="Save"
        confirmLoading={submitting}
        okButtonProps={{ disabled: deletingProvider }}
        cancelButtonProps={{ disabled: submitting || deletingProvider }}
        footer={(_, { OkBtn, CancelBtn }) => (
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Popconfirm
              title="Delete this provider?"
              description="This action cannot be undone."
              okText="Delete"
              okButtonProps={{ danger: true, loading: deletingProvider }}
              onConfirm={() => void removeProvider()}
            >
              <Button danger loading={deletingProvider} disabled={submitting}>
                Delete
              </Button>
            </Popconfirm>
            <Space>
              <CancelBtn />
              <OkBtn />
            </Space>
          </Space>
        )}
        destroyOnHidden
      >
        <Form form={editProviderForm} layout="vertical">
          <Form.Item name="displayName" label="Display Name">
            <Input placeholder="OpenAI Compatible" maxLength={120} />
          </Form.Item>
          <Form.Item name="kind" label="Kind" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'OpenAI', value: 'openai' },
                { label: 'Anthropic', value: 'anthropic' }
              ]}
            />
          </Form.Item>
          <Form.Item
            name="requestUrl"
            label="Request URL"
            rules={[{ required: true, message: 'Request URL is required' }]}
          >
            <Input placeholder="https://api.openai.com/v1" maxLength={2048} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑模型"
        open={editModelOpen}
        onCancel={() => {
          setEditModelOpen(false);
          setEditingModelId(null);
          editModelForm.resetFields();
        }}
        onOk={() => void submitEditModel()}
        okText="Save"
        confirmLoading={submitting}
        okButtonProps={{ disabled: deletingModel }}
        cancelButtonProps={{ disabled: submitting || deletingModel }}
        footer={(_, { OkBtn, CancelBtn }) => (
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Popconfirm
              title="Delete this model?"
              description="This action cannot be undone."
              okText="Delete"
              okButtonProps={{ danger: true, loading: deletingModel }}
              onConfirm={() => void removeModel()}
            >
              <Button danger loading={deletingModel} disabled={submitting}>
                Delete
              </Button>
            </Popconfirm>
            <Space>
              <CancelBtn />
              <OkBtn />
            </Space>
          </Space>
        )}
        destroyOnHidden
      >
        <Form form={editModelForm} layout="vertical" initialValues={{ isActive: true }}>
          <Form.Item name="modelType" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) =>
              prev.modelType !== cur.modelType || prev.requestPathSuffix !== cur.requestPathSuffix
            }
          >
            {() => {
              const mt = String(editModelForm.getFieldValue('modelType') ?? '');
              if (mt !== 'embedding') {
                return (
                  <Form.Item name="requestPathSuffix" label="Request Path Suffix">
                    <Input placeholder="/chat/completions" />
                  </Form.Item>
                );
              }
              const sfx = String(editModelForm.getFieldValue('requestPathSuffix') ?? '').trim();
              const standard = isEmbeddingPathStandard(sfx);
              return (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Typography.Text type="secondary">类型：embedding（不可在此修改类型）</Typography.Text>
                  <Alert
                    type="info"
                    showIcon
                    message="向量 API 路径"
                    description="保存后请用 Test 验证 Key。路径会写入数据库并参与解析：选「多模态」即使用 /embeddings/multimodal。火山 Ark 上 vision 类模型不支持普通 /embeddings，运行时会优先请求 multimodal，再按需回退到文本 /embeddings；非火山仍优先文本 /embeddings。若曾出现维度不一致，请确认部署环境 MEMORY_EMBEDDING_DIMENSIONS 与模型输出一致，并在升级后对该模型再保存一次以写入 embedding_dimensions。"
                  />
                  {standard ? (
                    <Form.Item
                      name="requestPathSuffix"
                      label="Embedding 请求路径"
                      rules={[{ required: true, message: '请选择向量 API 类型' }]}
                    >
                      <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {EMBEDDING_PATH_OPTIONS.map((opt) => (
                          <Radio key={opt.value} value={opt.value}>
                            <Typography.Text strong>{opt.label}</Typography.Text>
                            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 2 }}>
                              {opt.desc}
                            </Typography.Paragraph>
                          </Radio>
                        ))}
                      </Radio.Group>
                    </Form.Item>
                  ) : (
                    <>
                      <Alert type="warning" showIcon message="当前为自定义路径" />
                      <Form.Item
                        name="requestPathSuffix"
                        label="Request Path Suffix"
                        rules={[{ required: true, message: '路径必填' }]}
                      >
                        <Input placeholder="/v1/embeddings 等" />
                      </Form.Item>
                      <Button
                        type="link"
                        onClick={() => editModelForm.setFieldValue('requestPathSuffix', EMBEDDING_PATH_TEXT)}
                      >
                        改为标准文本路径 {EMBEDDING_PATH_TEXT}
                      </Button>
                    </>
                  )}
                  <Form.Item
                    name="embeddingDimensions"
                    label="向量维度"
                    tooltip="须与接口返回长度一致（如豆包 embedding-vision 多为 2048），并与部署环境 MEMORY_EMBEDDING_DIMENSIONS 一致。留空则服务端可按模型名推断。"
                  >
                    <InputNumber min={256} max={8192} step={128} placeholder="例如 2048" style={{ width: '100%' }} />
                  </Form.Item>
                </Space>
              );
            }}
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.modelType !== cur.modelType}>
            {() =>
              String(editModelForm.getFieldValue('modelType') ?? '') === 'embedding' ? (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="平台计费（model_pricing）"
                    description="向量调用按「每百万 token」单价入账。保存后将写入新的平台目录价版本；单价可为 0（免费）。"
                  />
                  <Form.Item
                    name="embeddingPricePerMillion"
                    label="Embedding 单价 (¥/百万 tokens)"
                    rules={catalogPriceRules('Embedding 单价')}
                  >
                    <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="必填；0 表示免费" />
                  </Form.Item>
                </Space>
              ) : (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="平台计费（model_pricing）"
                    description={`按模型名更新平台目录价：表单填人民币/百万 tokens（${BILLING_CREDIT_RATE_HINT}）；保存后写入新版本。单价可为 0（免费）。`}
                  />
                  <Form.Item
                    name="inputPricePerMillion"
                    label="Input 单价 (¥/百万 tokens)"
                    rules={catalogPriceRules('Input 单价')}
                  >
                    <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="必填；0 表示免费" />
                  </Form.Item>
                  <Form.Item
                    name="outputPricePerMillion"
                    label="Output 单价 (¥/百万 tokens)"
                    rules={catalogPriceRules('Output 单价')}
                  >
                    <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="必填；0 表示免费" />
                  </Form.Item>
                </Space>
              )
            }
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建密钥"
        open={newKeyOpen}
        onCancel={() => setNewKeyOpen(false)}
        onOk={() => void submitNewKey()}
        okText="Create"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Scope: {selectedProvider?.name ?? '-'} / {selectedModel?.name ?? '-'}
          </Typography.Text>
          <Form form={newKeyForm} layout="vertical" initialValues={{ dailyQuotaTokens: 0, isActive: true }}>
            <Form.Item name="keyAlias" label="Key Alias" rules={[{ required: true, message: 'Alias is required' }]}>
              <Input placeholder="OA-PROD-01" maxLength={120} />
            </Form.Item>
            <Form.Item name="secret" label="Secret" rules={[{ required: true, message: 'Secret is required' }]}>
              <Input.Password placeholder="sk-..." />
            </Form.Item>
            <Form.Item
              name="dailyQuotaTokens"
              label="Daily Quota Tokens"
              rules={[{ required: true, message: 'Daily quota is required' }]}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="isActive" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Modal
        title="选择默认向量模型"
        open={embeddingModelModalOpen}
        onCancel={() => setEmbeddingModelModalOpen(false)}
        onOk={() => void submitEmbeddingModel()}
        okText="保存"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={embeddingModelForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="按业务选择文本或多模态路径"
            description="「文本」=/embeddings，适合一般纯文本记忆。「多模态」=/embeddings/multimodal，用于图文向量或仅支持 multimodal 的模型（如豆包 embedding-vision）。平台/公司默认模型 ID 会指向此处配置的模型条目。请在该模型的「编辑」中填写向量维度（如 2048），并保证部署环境 MEMORY_EMBEDDING_DIMENSIONS 与库内 memory 向量列长度一致。"
          />
          <Form.Item name="defaultEmbeddingModelId" label="默认向量模型">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择默认 embedding model"
              options={embeddingModelOptions}
            />
          </Form.Item>
          <Typography.Text type="secondary">
            清空后将取消平台默认，运行时会按公司覆盖/Agent 绑定等规则继续解析。
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title={`轮换密钥${rotateTarget ? `：${rotateTarget.alias}` : ''}`}
        open={!!rotateTarget}
        onCancel={() => {
          setRotateTarget(null);
          rotateForm.resetFields();
        }}
        onOk={() => void submitRotate()}
        okText="Rotate"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={rotateForm} layout="vertical">
          <Form.Item name="secret" label="New Secret" rules={[{ required: true, message: 'New secret is required' }]}>
            <Input.Password placeholder="sk-new..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
