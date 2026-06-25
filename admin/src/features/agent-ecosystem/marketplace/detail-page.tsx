import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { adminAuthedRequestJson } from '../../../shared/api/client';
import { yuanPerMillionTokensFromCatalogCredits } from '../../billing/constants';
import { listAdminSkills } from '../skills-tools-mcp/skills/api';
import { MarketplaceAgentTestModal } from './marketplace-agent-test-modal';
import {
  buildKeySelectOptions,
  useBindableModelKeys,
  type LlmKeyPoolGroup,
} from './hooks/use-bindable-model-keys';
import { usePlatformDepartmentRoleOptions } from './hooks/use-platform-department-role-options';
import {
  buildMarketplaceDetailState,
  buildMarketplaceListHref,
  defaultMarketplaceListPath,
  type MarketplaceDetailLocationState,
} from './marketplace-list-navigation';

type MarketplaceAgentDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  expertise: string | null;
  systemPrompt: string | null;
  recommendedSkills: string[];
  skillTags: string[];
  industryTags: string[];
  catalogPricing?: {
    inputPricePerMillion: string;
    outputPricePerMillion: string;
    currency: string;
  } | null;
  isPublished: boolean;
  boundModelName?: string | null;
  agentCategory?: 'ceo' | 'department_head' | 'employee' | string;
  departmentRoles?: string[];
  keyBindings?: Array<{
    llmKeyId: string;
    sortOrder: number;
    keyAlias?: string;
    modelName?: string;
  }>;
};

type AgentFormValues = {
  name?: string;
  chineseName?: string;
  slug?: string;
  slogan?: string;
  detailedDescription?: string;
  industryTags?: string[];
  scenarioTags?: string[];
  authorAccount?: string;
  contact?: string;
  systemPrompt?: string;
  recommendedSkills?: string[];
  modelSelection?: string;
  publishNow?: boolean;
  departmentRoles?: string[];
  modelKeyIds?: string[];
};

export default function AgentMarketplaceDetailPage(): ReactElement {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const listBack = (location.state as MarketplaceDetailLocationState | null)?.marketplaceListBack;
  const [form] = Form.useForm<AgentFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [fetching, setFetching] = useState(false);
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [skillOptions, setSkillOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
  const [boundSkillNames, setBoundSkillNames] = useState<string[]>([]);
  const [loadingSkillOptions, setLoadingSkillOptions] = useState(false);
  const [applyingSkills, setApplyingSkills] = useState(false);
  const [saving, setSaving] = useState(false);
  const [headerActionLoading, setHeaderActionLoading] = useState<'publish' | 'offline' | 'clone' | 'delete' | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [agentTestMeta, setAgentTestMeta] = useState<{
    name: string;
    boundModelName?: string | null;
    keyBindings?: MarketplaceAgentDetail['keyBindings'];
  }>({ name: '' });
  const [catalogPricing, setCatalogPricing] = useState<MarketplaceAgentDetail['catalogPricing']>(null);
  const [agentCategory, setAgentCategory] = useState<string>('employee');

  const {
    models,
    keyGroups,
    loading: modelAssetsLoading,
    chatModelOptions,
    getCurrentModelKeys,
  } = useBindableModelKeys({ agentId, enabled: !!agentId });

  const selectedModelId = Form.useWatch('modelSelection', form);

  const selectedModel = useMemo(
    () => models.find((item) => item.id === selectedModelId),
    [models, selectedModelId],
  );

  const currentModelKeys = useMemo(
    () => getCurrentModelKeys(selectedModel),
    [getCurrentModelKeys, selectedModel],
  );

  const {
    options: departmentRoleOptions,
    loading: departmentRolesLoading,
    error: departmentRolesError,
  } = usePlatformDepartmentRoleOptions(agentCategory !== 'ceo' && !fetching);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      if (!agentId) return;
      try {
        setFetching(true);
        const detail = await adminAuthedRequestJson<MarketplaceAgentDetail>(`/api/admin/marketplace/agents/${agentId}`);
        if (!mounted) return;
        form.setFieldsValue({
          name: detail.name ?? '',
          slug: detail.slug ?? '',
          slogan: detail.expertise ?? '',
          detailedDescription: detail.description ?? '',
          industryTags: detail.industryTags ?? [],
          scenarioTags: detail.skillTags ?? [],
          systemPrompt: detail.systemPrompt ?? '',
          recommendedSkills: detail.recommendedSkills ?? [],
          modelSelection: detail.keyBindings?.[0]?.modelName ?? '',
          modelKeyIds: Array.isArray(detail.keyBindings) ? detail.keyBindings.map((item) => item.llmKeyId) : [],
          publishNow: !!detail.isPublished,
          departmentRoles: detail.departmentRoles ?? [],
        });
        setBoundSkillNames(detail.recommendedSkills ?? []);
        setCatalogPricing(detail.catalogPricing ?? null);
        setAgentCategory(String(detail.agentCategory ?? 'employee'));
        setAgentTestMeta({
          name: detail.name ?? '',
          boundModelName: detail.boundModelName ?? detail.keyBindings?.[0]?.modelName ?? null,
          keyBindings: detail.keyBindings,
        });
      } catch (error) {
        if (!mounted) return;
        messageApi.error(error instanceof Error ? error.message : String(error));
      } finally {
        if (mounted) setFetching(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [agentId, form, messageApi]);

  useEffect(() => {
    if (!models.length || !keyGroups.length) return;
    const current = form.getFieldValue('modelSelection');
    if (models.some((item) => item.id === current)) return;

    const keyIds: string[] = form.getFieldValue('modelKeyIds') ?? [];
    if (keyIds.length > 0) {
      for (const group of keyGroups) {
        const key = group.keys.find((item) => item.id === keyIds[0]);
        if (!key) continue;
        const byModelId = key.llmModelId ? models.find((item) => item.id === key.llmModelId) : undefined;
        const byProvider = models.find(
          (item) => item.modelName === group.modelName && item.providerCode === group.provider,
        );
        const resolved = byModelId ?? byProvider;
        if (resolved) {
          form.setFieldValue('modelSelection', resolved.id);
          return;
        }
      }
    }

    const legacyModelName = String(current ?? '').trim();
    if (!legacyModelName) return;
    const matches = models.filter((item) => item.modelName === legacyModelName);
    if (matches.length === 1) {
      form.setFieldValue('modelSelection', matches[0]!.id);
    }
  }, [models, keyGroups, form]);

  const handleBack = (): void => {
    if (listBack) {
      navigate(buildMarketplaceListHref(listBack));
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(defaultMarketplaceListPath(agentCategory));
  };

  const doHeaderAction = async (
    action: 'publish' | 'offline' | 'clone' | 'delete',
    request: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> => {
    if (!agentId) {
      messageApi.error('Missing agent id.');
      return;
    }
    setHeaderActionLoading(action);
    try {
      const result = await request();
      if (action === 'clone' && result && typeof result === 'object' && 'id' in result) {
        const clonedId = String((result as { id?: string }).id ?? '').trim();
        messageApi.success(clonedId ? `${successMessage} New agent id: ${clonedId}` : successMessage);
      } else {
        messageApi.success(successMessage);
      }
      if (action === 'delete') {
        handleBack();
        return;
      }
      if (action === 'clone' && result && typeof result === 'object' && 'id' in result) {
        const clonedId = String((result as { id?: string }).id ?? '').trim();
        if (clonedId) {
          const detailPath =
            agentCategory === 'department_head'
              ? `/agent-ecosystem/marketplace/department-head/${clonedId}`
              : `/agent-ecosystem/marketplace/${clonedId}`;
          navigate(detailPath, { state: location.state });
          return;
        }
      }
      if (action === 'publish') {
        form.setFieldValue('publishNow', true);
      }
      if (action === 'offline') {
        form.setFieldValue('publishNow', false);
      }
      if (agentId) {
        const detail = await adminAuthedRequestJson<MarketplaceAgentDetail>(`/api/admin/marketplace/agents/${agentId}`);
        form.setFieldsValue({
          publishNow: !!detail.isPublished,
          recommendedSkills: detail.recommendedSkills ?? [],
        });
        setBoundSkillNames(detail.recommendedSkills ?? []);
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setHeaderActionLoading(null);
    }
  };

  const openSkillModal = async (): Promise<void> => {
    try {
      setLoadingSkillOptions(true);
      const res = await listAdminSkills({ page: 1, pageSize: 100 });
      const options = (res.items ?? []).map((item) => ({
        label: item.displayName?.trim() || item.name,
        value: item.name,
      }));
      setSkillOptions(options);
      setSelectedSkillNames(boundSkillNames);
      setSkillModalOpen(true);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSkillOptions(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!agentId) {
      messageApi.error('Missing agent id.');
      return;
    }
    try {
      setSaving(true);
      const values = form.getFieldsValue(true);
      await adminAuthedRequestJson(`/api/admin/marketplace/agents/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: values.name ?? undefined,
          description: values.detailedDescription ?? undefined,
          expertise: values.slogan ?? undefined,
          systemPrompt: values.systemPrompt ?? undefined,
          recommendedSkills: values.recommendedSkills ?? [],
          skillTags: values.scenarioTags ?? [],
          industryTags: values.industryTags ?? [],
          isPublished: !!values.publishNow,
          departmentRoles: values.departmentRoles ?? [],
          keyBindings: (values.modelKeyIds ?? []).map((llmKeyId: string, index: number) => ({
            llmKeyId,
            sortOrder: index,
          })),
        }),
      });
      setBoundSkillNames(values.recommendedSkills ?? []);
      messageApi.success('Agent template saved.');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="erp-page-stack">
      {contextHolder}
      <Card>
        <div className="erp-market-detail-header">
          <div>
            <Button type="link" icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ paddingLeft: 0, marginBottom: 4 }}>
              返回列表
            </Button>
            <h2 className="erp-market-title">市场模板详情</h2>
            <p className="erp-market-subtitle">
              ID：<Typography.Text code>{agentId ?? '—'}</Typography.Text>
            </p>
          </div>
          <Space wrap>
            <Button type="primary" onClick={() => void handleSave()} loading={saving}>
              保存
            </Button>
            <Button onClick={() => setTestModalOpen(true)} disabled={!agentId}>
              试调用
            </Button>
            <Button
              type="primary"
              loading={headerActionLoading === 'publish'}
              onClick={() =>
                void doHeaderAction(
                  'publish',
                  () => adminAuthedRequestJson(`/api/admin/marketplace/agents/${agentId}/publish`, { method: 'POST' }),
                  'Agent published.',
                )
              }
            >
              发布
            </Button>
            <Button
              loading={headerActionLoading === 'offline'}
              onClick={() =>
                void doHeaderAction(
                  'offline',
                  () => adminAuthedRequestJson(`/api/admin/marketplace/agents/${agentId}/offline`, { method: 'POST' }),
                  'Agent offline.',
                )
              }
            >
              下线
            </Button>
            <Button
              loading={headerActionLoading === 'clone'}
              onClick={() =>
                void doHeaderAction(
                  'clone',
                  () => adminAuthedRequestJson(`/api/admin/marketplace/agents/${agentId}/clone`, { method: 'POST' }),
                  'Agent cloned.',
                )
              }
            >
              克隆
            </Button>
            <Button
              danger
              loading={headerActionLoading === 'delete'}
              onClick={() => {
                Modal.confirm({
                  title: '删除该市场模板？',
                  content: '此操作不可撤销。',
                  okText: '删除',
                  okButtonProps: { danger: true },
                  onOk: () =>
                    doHeaderAction(
                      'delete',
                      () => adminAuthedRequestJson(`/api/admin/marketplace/agents/${agentId}`, { method: 'DELETE' }),
                      'Agent deleted.',
                    ),
                });
              }}
            >
              删除
            </Button>
          </Space>
        </div>
      </Card>

      <Card>
        {fetching ? (
          <Spin />
        ) : (
          <Tabs
          tabPosition="top"
          items={[
            {
              key: 'basic',
              label: '基本信息',
              children: (
                <Form<AgentFormValues> form={form} layout="vertical">
                  <Alert
                    type="info"
                    showIcon
                    message="以下字段会随「保存」写入后端；Slug 创建后不可修改。"
                    style={{ marginBottom: 16 }}
                  />
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                        <Input placeholder="模板显示名称" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="slug" label="Slug（只读）">
                        <Input readOnly />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="slogan" label="专长摘要（expertise）">
                    <Input placeholder="一句话描述专长" />
                  </Form.Item>
                  <Form.Item name="detailedDescription" label="描述（description）">
                    <Input.TextArea rows={4} placeholder="详细说明" />
                  </Form.Item>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Form.Item name="industryTags" label="行业标签">
                        <Select mode="tags" placeholder="添加行业标签" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="scenarioTags" label="技能标签（skillTags）">
                        <Select mode="tags" placeholder="添加技能标签" />
                      </Form.Item>
                    </Col>
                  </Row>
                  {agentCategory !== 'ceo' ? (
                    <>
                      <Alert
                        type="info"
                        showIcon
                        message="部门角色（departmentRoles）"
                        description="下拉选项来自 Admin → Platform Departments。用于公司向导 / 部门人才池匹配；留空则不会自动分配到任何部门。"
                        style={{ marginBottom: 16 }}
                      />
                      {departmentRolesError ? (
                        <Alert
                          type="warning"
                          showIcon
                          message="平台部门列表加载失败"
                          description={departmentRolesError}
                          style={{ marginBottom: 16 }}
                        />
                      ) : null}
                      <Form.Item name="departmentRoles" label="部门角色（departmentRoles）">
                        <Select
                          mode="tags"
                          loading={departmentRolesLoading}
                          placeholder={
                            departmentRolesLoading
                              ? '加载平台部门…'
                              : departmentRoleOptions.length > 0
                                ? '从平台部门选择 slug'
                                : '暂无平台部门，请先在 Platform Departments 创建'
                          }
                          options={departmentRoleOptions}
                        />
                      </Form.Item>
                    </>
                  ) : null}
                  <Form.Item name="publishNow" label="已发布" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Form>
              )
            },
            {
              key: 'prompt',
              label: '系统提示词',
              children: (
                <Form<AgentFormValues> form={form} layout="vertical">
                  <Form.Item name="systemPrompt" label="System Prompt">
                    <Input.TextArea rows={14} placeholder="系统提示词模板" />
                  </Form.Item>
                </Form>
              )
            },
            {
              key: 'skills',
              label: '技能绑定',
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                  <Card size="small" title="已绑定 Skills">
                    <Space wrap>
                      {boundSkillNames.length > 0 ? (
                        boundSkillNames.map((skill) => (
                          <Tag color="blue" key={skill}>
                            {skill}
                          </Tag>
                        ))
                      ) : (
                        <Tag>无</Tag>
                      )}
                    </Space>
                  </Card>
                  <Button type="primary" onClick={() => void openSkillModal()} loading={loadingSkillOptions}>
                    从平台 Skill 库添加
                  </Button>
                </Space>
              )
            },
            {
              key: 'models',
              label: '模型与密钥',
              children: (
                <Form<AgentFormValues> form={form} layout="vertical">
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Form.Item name="modelSelection" label="Chat 模型">
                        <Select
                          placeholder="选择模型"
                          showSearch
                          loading={modelAssetsLoading}
                          options={chatModelOptions}
                          onChange={() => form.setFieldValue('modelKeyIds', [])}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="modelKeyIds" label="模型密钥（多选，顺序即优先级）">
                        <Select
                          mode="multiple"
                          placeholder={
                            selectedModel
                              ? currentModelKeys.length > 0
                                ? '选择密钥'
                                : '该模型下暂无可用 Key'
                              : '请先选择模型'
                          }
                          disabled={!selectedModel}
                          loading={modelAssetsLoading}
                          options={buildKeySelectOptions(currentModelKeys, { showCurrentBoundLabel: true })}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  {agentCategory !== 'ceo' ? (
                    <Alert
                      type="info"
                      showIcon
                      message="目录定价（只读）"
                      description={
                        catalogPricing
                          ? `Input ¥${yuanPerMillionTokensFromCatalogCredits(Number(catalogPricing.inputPricePerMillion)).toLocaleString('zh-CN')} / Output ¥${yuanPerMillionTokensFromCatalogCredits(Number(catalogPricing.outputPricePerMillion)).toLocaleString('zh-CN')}（每百万 tokens）。请在「平台模型与密钥」中维护绑定模型的价格。`
                          : '绑定模型尚未配置平台目录价；请在「平台模型与密钥」中为该模型设置 Input/Output 单价。'
                      }
                    />
                  ) : null}
                </Form>
              )
            },
          ]}
          />
        )}
        {!agentId ? <Alert type="warning" showIcon message="Missing agent id in route params." /> : null}
      </Card>
      <Modal
        title="添加平台 Skills"
        open={skillModalOpen}
        onCancel={() => setSkillModalOpen(false)}
        confirmLoading={applyingSkills}
        onOk={async () => {
          if (!agentId) {
            messageApi.error('Missing agent id.');
            return;
          }
          try {
            setApplyingSkills(true);
            await adminAuthedRequestJson(`/api/admin/marketplace/agents/${agentId}`, {
              method: 'PUT',
              body: JSON.stringify({
                recommendedSkills: selectedSkillNames,
              }),
            });
            form.setFieldValue('recommendedSkills', selectedSkillNames);
            setBoundSkillNames(selectedSkillNames);
            setSkillModalOpen(false);
            messageApi.success('Skills bound and saved.');
          } catch (error) {
            messageApi.error(error instanceof Error ? error.message : String(error));
          } finally {
            setApplyingSkills(false);
          }
        }}
        okText="应用"
      >
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="选择 Skills"
          options={skillOptions}
          value={selectedSkillNames}
          onChange={(values) => setSelectedSkillNames(values)}
          optionFilterProp="label"
          showSearch
        />
      </Modal>
      {agentId ? (
        <MarketplaceAgentTestModal
          open={testModalOpen}
          agentId={agentId}
          agentName={agentTestMeta.name}
          boundModelName={agentTestMeta.boundModelName}
          keyBindings={agentTestMeta.keyBindings?.map((b) => ({
            llmKeyId: b.llmKeyId,
            keyAlias: b.keyAlias,
            modelName: b.modelName,
          }))}
          onClose={() => setTestModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
