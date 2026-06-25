import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { listMarketplaceAgents, type MarketplaceAgentListItem } from '../../platform-departments/api';
import { adminAuthedRequestJson } from '../../../shared/api/client';
import {
  buildKeySelectOptions,
  useBindableModelKeys,
} from './hooks/use-bindable-model-keys';
import { usePlatformDepartmentRoleOptions } from './hooks/use-platform-department-role-options';
import { useMarketplaceListQuery } from './hooks/use-marketplace-list-query';
import { buildMarketplaceDetailState } from './marketplace-list-navigation';

const { Text } = Typography;

const DEPARTMENT_HEAD_LIST_PATH = '/agent-ecosystem/marketplace/department-head';

type StatusFilter = 'all' | 'published' | 'draft';
const DEFAULT_DEPARTMENT_HEAD_ROLE = 'operation';

type CreateDepartmentHeadFormValues = {
  name: string;
  slug?: string;
  description?: string;
  expertise?: string;
  systemPrompt?: string;
  boundModelName?: string;
  modelKeyIds?: string[];
  recommendedSkills?: string[];
  skillTags?: string[];
  industryTags?: string[];
  isPublished?: boolean;
  departmentRoles?: string[];
};

function toDateText(value: string | Date | undefined): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export default function AgentMarketplaceDepartmentHeadPage(): ReactElement {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [createForm] = Form.useForm<CreateDepartmentHeadFormValues>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const {
    page,
    pageSize,
    status,
    appliedSearch,
    listBack: marketplaceListBack,
    setPage,
    setPageSize,
    setStatus,
    applySearch,
  } = useMarketplaceListQuery(DEPARTMENT_HEAD_LIST_PATH);
  const [searchInput, setSearchInput] = useState(appliedSearch);
  const [total, setTotal] = useState<number>(0);
  const [items, setItems] = useState<MarketplaceAgentListItem[]>([]);
  const [rowActionKey, setRowActionKey] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(appliedSearch);
  }, [appliedSearch]);

  const openDepartmentHeadDetail = (agentId: string): void => {
    navigate(`/agent-ecosystem/marketplace/department-head/${agentId}`, {
      state: buildMarketplaceDetailState(marketplaceListBack),
    });
  };

  const {
    models,
    loading: modelAssetsLoading,
    error: modelAssetsError,
    reload: reloadModelAssets,
    chatModelOptions,
    getCurrentModelKeys,
  } = useBindableModelKeys({ enabled: createOpen });

  const {
    options: departmentRoleOptions,
    loading: departmentRolesLoading,
    error: departmentRolesError,
  } = usePlatformDepartmentRoleOptions(createOpen);

  const selectedModelId = Form.useWatch('boundModelName', createForm);

  const selectedModel = useMemo(
    () => models.find((item) => item.id === selectedModelId),
    [models, selectedModelId],
  );

  const currentModelKeys = useMemo(
    () => getCurrentModelKeys(selectedModel),
    [getCurrentModelKeys, selectedModel],
  );

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMarketplaceAgents({
        page,
        pageSize,
        status,
        search: appliedSearch.trim() || undefined,
        agentCategory: 'department_head',
      });
      setItems(res.items ?? []);
      setTotal(typeof res.total === 'number' ? res.total : (res.items?.length ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, pageSize, status, appliedSearch]);

  const createDepartmentHead = async (): Promise<void> => {
    try {
      const values = await createForm.validateFields();
      const modelKeyIds = (values.modelKeyIds ?? []).map((id) => String(id).trim()).filter(Boolean);
      const selectedModelItem = models.find((item) => item.id === values.boundModelName);
      setCreating(true);
      const roles =
        Array.isArray(values.departmentRoles) && values.departmentRoles.length > 0
          ? values.departmentRoles
          : [DEFAULT_DEPARTMENT_HEAD_ROLE];
      await adminAuthedRequestJson('/api/admin/marketplace/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name?.trim(),
          slug: values.slug?.trim() || undefined,
          description: values.description?.trim() || null,
          expertise: values.expertise?.trim() || null,
          systemPrompt: values.systemPrompt?.trim() || null,
          boundModelName: selectedModelItem?.modelName ?? (values.boundModelName?.trim() || null),
          keyBindings: modelKeyIds.map((llmKeyId, index) => ({ llmKeyId, sortOrder: index })),
          recommendedSkills: values.recommendedSkills ?? [],
          skillTags: values.skillTags ?? [],
          industryTags: values.industryTags ?? [],
          isPublished: !!values.isPublished,
          agentCategory: 'department_head',
          departmentRoles: roles,
        }),
      });
      messageApi.success('Department head template created');
      setCreateOpen(false);
      createForm.resetFields();
      setPage(1);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg) {
        messageApi.error(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  const runRowAction = async (
    record: MarketplaceAgentListItem,
    action: 'publish' | 'offline' | 'clone' | 'delete',
  ): Promise<void> => {
    setRowActionKey(`${record.id}:${action}`);
    try {
      if (action === 'publish') {
        await adminAuthedRequestJson(`/api/admin/marketplace/agents/${record.id}/publish`, { method: 'POST' });
        messageApi.success('Published');
      } else if (action === 'offline') {
        await adminAuthedRequestJson(`/api/admin/marketplace/agents/${record.id}/offline`, { method: 'POST' });
        messageApi.success('Offline');
      } else if (action === 'clone') {
        const cloned = await adminAuthedRequestJson<{ id?: string }>(`/api/admin/marketplace/agents/${record.id}/clone`, {
          method: 'POST',
        });
        const clonedId = String(cloned?.id ?? '').trim();
        messageApi.success(clonedId ? `Cloned: ${clonedId}` : 'Cloned');
        if (clonedId) openDepartmentHeadDetail(clonedId);
      } else {
        await adminAuthedRequestJson(`/api/admin/marketplace/agents/${record.id}`, { method: 'DELETE' });
        messageApi.success('Deleted');
      }
      await load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRowActionKey(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: 'Agent',
        key: 'agent',
        width: 340,
        render: (_: unknown, record: MarketplaceAgentListItem) => (
          <Space>
            <Avatar className="erp-market-avatar">
              {String(record.name || record.slug || '?').slice(0, 1).toUpperCase()}
            </Avatar>
            <div style={{ minWidth: 0 }}>
              <div className="erp-market-agent-name">{record.name}</div>
              <div className="erp-market-agent-meta">{record.slug}</div>
            </div>
          </Space>
        ),
      },
      {
        title: 'Published',
        dataIndex: 'isPublished',
        key: 'isPublished',
        width: 120,
        render: (v: boolean) => (v ? <Tag color="success">Published</Tag> : <Tag>Draft</Tag>),
      },
      {
        title: 'Department roles',
        key: 'departmentRoles',
        render: (_: unknown, record: MarketplaceAgentListItem) => {
          const roles = Array.isArray(record.departmentRoles) ? record.departmentRoles : [];
          if (roles.length === 0) return <Text type="secondary">-</Text>;
          return (
            <Space size={[4, 4]} wrap>
              {roles.slice(0, 8).map((r) => (
                <Tag key={r}>{r}</Tag>
              ))}
              {roles.length > 8 ? <Tag>+{roles.length - 8}</Tag> : null}
            </Space>
          );
        },
      },
      {
        title: 'Model',
        dataIndex: 'boundModelName',
        key: 'boundModelName',
        width: 160,
        render: (v: unknown) => (typeof v === 'string' && v.trim() ? <Text code>{v}</Text> : <Text type="secondary">-</Text>),
      },
      {
        title: 'Keys',
        dataIndex: 'keyCount',
        key: 'keyCount',
        width: 90,
        render: (v: unknown) => (typeof v === 'number' ? v : <Text type="secondary">-</Text>),
      },
      {
        title: 'Updated',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 200,
        render: (v: string | Date) => toDateText(v),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 340,
        render: (_: unknown, record: MarketplaceAgentListItem) => (
          <Space size={6} wrap>
            <Button size="small" onClick={() => openDepartmentHeadDetail(record.id)}>
              Details
            </Button>
            <Button
              size="small"
              loading={rowActionKey === `${record.id}:publish`}
              disabled={!!record.isPublished}
              onClick={() => void runRowAction(record, 'publish')}
            >
              Publish
            </Button>
            <Button
              size="small"
              loading={rowActionKey === `${record.id}:offline`}
              disabled={!record.isPublished}
              onClick={() => void runRowAction(record, 'offline')}
            >
              Offline
            </Button>
            <Button
              size="small"
              loading={rowActionKey === `${record.id}:clone`}
              onClick={() => void runRowAction(record, 'clone')}
            >
              Clone
            </Button>
            <Button
              size="small"
              danger
              loading={rowActionKey === `${record.id}:delete`}
              onClick={() => {
                Modal.confirm({
                  title: 'Delete agent template?',
                  content: 'This action cannot be undone.',
                  okText: 'Delete',
                  okButtonProps: { danger: true },
                  onOk: () => runRowAction(record, 'delete'),
                });
              }}
            >
              Delete
            </Button>
          </Space>
        ),
      },
    ],
    [navigate],
  );

  return (
    <div className="erp-marketplace-page">
      {contextHolder}
      <Card className="erp-market-header" variant="borderless">
        <div className="erp-market-header__top">
          <div>
            <h2 className="erp-market-title">Agent Marketplace - Department Head</h2>
            <p className="erp-market-subtitle">
              Manage platform department head agent templates, including create and list workflows.
            </p>
          </div>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={loading}
            >
              New Department Head
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
          </Space>
        </div>

        <div className="erp-market-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search by name, slug, description, or expertise"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={() => applySearch(searchInput)}
            className="erp-market-search"
          />
          <Select<StatusFilter>
            value={status}
            style={{ width: 160 }}
            onChange={(v) => setStatus(v)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Published', value: 'published' },
              { label: 'Draft', value: 'draft' },
            ]}
          />
          <Button
            onClick={() => applySearch(searchInput)}
            disabled={loading}
          >
            Search
          </Button>
        </div>
      </Card>

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Load failed"
          description={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card title="Department Head Templates" className="erp-market-table-card" variant="borderless">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns as any}
          dataSource={items}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              if (typeof nextSize === 'number' && nextSize !== pageSize) {
                setPageSize(nextSize);
              }
            },
          }}
        />
      </Card>

      <Modal
        title="Create Department Head Template"
        open={createOpen}
        onCancel={() => {
          if (creating) return;
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => void createDepartmentHead()}
        okText="Create"
        confirmLoading={creating}
        width={760}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Department role is optional in this form"
          description="If no role is selected, the system will submit a default role token."
        />
        <Form<CreateDepartmentHeadFormValues> form={createForm} layout="vertical" initialValues={{ isPublished: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Please input template name' }]}>
            <Input placeholder="Growth Director Agent" />
          </Form.Item>
          <Form.Item name="slug" label="Slug (optional)">
            <Input placeholder="growth-director-agent" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="What this department head template focuses on..." />
          </Form.Item>
          <Form.Item name="expertise" label="Expertise">
            <Input.TextArea rows={2} placeholder="Core domain expertise..." />
          </Form.Item>
          <Form.Item name="systemPrompt" label="System Prompt">
            <Input.TextArea rows={5} placeholder="System prompt template..." />
          </Form.Item>
          {modelAssetsError ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="模型库加载失败"
              description={modelAssetsError}
              action={
                <Button size="small" onClick={() => void reloadModelAssets()} loading={modelAssetsLoading}>
                  重试
                </Button>
              }
            />
          ) : null}
          <Form.Item
            name="boundModelName"
            label="绑定模型"
            rules={[{ required: true, message: '请选择 chat 模型' }]}
          >
            <Select
              showSearch
              placeholder="从模型库选择 chat 模型"
              loading={modelAssetsLoading}
              options={chatModelOptions}
              optionFilterProp="label"
              notFoundContent={modelAssetsLoading ? '加载中…' : '暂无可用 chat 模型，请先在「Platform Models & Keys」中配置'}
              onChange={() => {
                createForm.setFieldValue('modelKeyIds', []);
              }}
            />
          </Form.Item>
          <Form.Item
            name="modelKeyIds"
            label="绑定 Key"
            rules={[
              { required: true, message: '请至少选择一个 Key' },
              {
                validator: async (_, value: string[] | undefined) => {
                  const ids = (value ?? []).filter(Boolean);
                  if (!ids.length) return;
                  const invalid = ids.filter((id) => !currentModelKeys.some((k) => k.id === id));
                  if (invalid.length > 0) {
                    throw new Error('所选 Key 与当前模型不匹配');
                  }
                },
              },
            ]}
          >
            <Select
              mode="multiple"
              placeholder={
                selectedModel
                  ? currentModelKeys.length > 0
                    ? '选择该模型下的 Key（可多选）'
                    : '该模型下暂无可用 Key'
                  : '请先选择模型'
              }
              disabled={!selectedModel}
              loading={modelAssetsLoading}
              options={buildKeySelectOptions(currentModelKeys)}
            />
          </Form.Item>
          <Form.Item name="recommendedSkills" label="Recommended Skills">
            <Select mode="tags" placeholder="Add skill names" />
          </Form.Item>
          <Form.Item name="skillTags" label="Skill Tags">
            <Select mode="tags" placeholder="Add skill tags" />
          </Form.Item>
          <Form.Item name="industryTags" label="Industry Tags">
            <Select mode="tags" placeholder="Add industry tags" />
          </Form.Item>
          {departmentRolesError ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="平台部门列表加载失败"
              description={departmentRolesError}
            />
          ) : null}
          <Form.Item
            name="departmentRoles"
            label="部门角色（departmentRoles）"
            tooltip="选项来自 Admin → Platform Departments"
          >
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
          <Form.Item name="isPublished" label="Publish now" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
