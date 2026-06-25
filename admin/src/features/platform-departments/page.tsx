import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  createPlatformDepartment,
  listMarketplaceAgents,
  listPlatformDepartments,
  removePlatformDepartment,
  setPlatformDepartmentDirector,
  updatePlatformDepartment,
  type PlatformDepartmentRow,
} from './api';
import { DepartmentCapabilityFields } from './DepartmentCapabilityFields';
import { templateCapabilityForSlug } from './capability-helpers';

type CapabilityFields = {
  responsibilitySummary: string;
  taskTypeTags?: string[];
  excludesTaskTypeTags?: string[];
};

type CreateFormValues = {
  slug: string;
  displayName: string;
  sortOrder?: number;
  isDefaultForNewCompany?: boolean;
  directorMarketplaceAgentId?: string;
} & CapabilityFields;

type EditFormValues = {
  slug?: string;
  displayName?: string;
  sortOrder?: number;
  isDefaultForNewCompany?: boolean;
} & CapabilityFields;

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => String(t ?? '').trim()).filter(Boolean);
}

export default function PlatformDepartmentsPage(): ReactElement {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PlatformDepartmentRow[]>([]);

  const [activeTab, setActiveTab] = useState<'all' | 'default'>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateFormValues>();
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const createSlug = Form.useWatch('slug', createForm);

  const [editing, setEditing] = useState<PlatformDepartmentRow | null>(null);
  const [editForm] = Form.useForm<EditFormValues>();
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [directorModal, setDirectorModal] = useState<PlatformDepartmentRow | null>(null);
  const [directorId, setDirectorId] = useState<string | null>(null);
  const [directorOptions, setDirectorOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [directorLoading, setDirectorLoading] = useState(false);
  const [directorSubmitting, setDirectorSubmitting] = useState(false);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await listPlatformDepartments();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载部门列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!createOpen || !createSlug) return;
    const summary = String(createForm.getFieldValue('responsibilitySummary') ?? '').trim();
    if (summary.length >= 8) return;
    const tmpl = templateCapabilityForSlug(createSlug);
    if (!tmpl) return;
    createForm.setFieldsValue({
      responsibilitySummary: tmpl.responsibilitySummary,
      taskTypeTags: tmpl.taskTypeTags,
      excludesTaskTypeTags: tmpl.excludesTaskTypeTags,
    });
  }, [createOpen, createSlug, createForm]);

  const dataSource = useMemo(() => {
    if (activeTab === 'default') {
      return rows.filter((r) => r.isDefaultForNewCompany);
    }
    return rows;
  }, [activeTab, rows]);

  const openCreate = (): void => {
    createForm.resetFields();
    setCreateOpen(true);
  };

  const submitCreate = async (): Promise<void> => {
    const values = await createForm.validateFields();
    setCreateSubmitting(true);
    try {
      await createPlatformDepartment({
        slug: values.slug,
        displayName: values.displayName,
        responsibilitySummary: values.responsibilitySummary.trim(),
        taskTypeTags: normalizeTags(values.taskTypeTags),
        excludesTaskTypeTags: normalizeTags(values.excludesTaskTypeTags),
        sortOrder: values.sortOrder,
        isDefaultForNewCompany: Boolean(values.isDefaultForNewCompany),
        directorMarketplaceAgentId: values.directorMarketplaceAgentId?.trim() || null,
      });
      message.success('已创建部门');
      setCreateOpen(false);
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openEdit = (row: PlatformDepartmentRow): void => {
    setEditing(row);
    editForm.setFieldsValue({
      slug: row.slug,
      displayName: row.displayName,
      sortOrder: row.sortOrder,
      isDefaultForNewCompany: row.isDefaultForNewCompany,
      responsibilitySummary: row.responsibilitySummary ?? '',
      taskTypeTags: row.taskTypeTags ?? [],
      excludesTaskTypeTags: row.excludesTaskTypeTags ?? [],
    });
  };

  const submitEdit = async (): Promise<void> => {
    if (!editing) return;
    const values = await editForm.validateFields();
    setEditSubmitting(true);
    try {
      await updatePlatformDepartment(editing.id, {
        slug: values.slug,
        displayName: values.displayName,
        sortOrder: values.sortOrder,
        isDefaultForNewCompany: values.isDefaultForNewCompany,
        responsibilitySummary: values.responsibilitySummary.trim(),
        taskTypeTags: normalizeTags(values.taskTypeTags),
        excludesTaskTypeTags: normalizeTags(values.excludesTaskTypeTags),
      });
      message.success('已保存');
      setEditing(null);
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setEditSubmitting(false);
    }
  };

  const submitRemove = async (id: string): Promise<void> => {
    try {
      await removePlatformDepartment(id);
      message.success('已删除');
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const openDirector = (row: PlatformDepartmentRow): void => {
    setDirectorModal(row);
    setDirectorId(row.director?.id ?? null);
    setDirectorOptions([]);
  };

  const searchDirector = async (search?: string): Promise<void> => {
    setDirectorLoading(true);
    try {
      const resp = await listMarketplaceAgents({
        page: 1,
        pageSize: 50,
        search,
        status: 'published',
      });
      const items = resp.items ?? [];
      setDirectorOptions(
        items
          .filter((a) => a.slug !== 'ceo')
          .map((a) => ({
            value: a.id,
            label: `${a.name} (${a.slug})`,
          })),
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载主管候选失败');
    } finally {
      setDirectorLoading(false);
    }
  };

  const submitDirector = async (): Promise<void> => {
    if (!directorModal) return;
    if (!directorId) {
      message.error('请选择一个主管（商城 Agent）');
      return;
    }
    setDirectorSubmitting(true);
    try {
      await setPlatformDepartmentDirector(directorModal.id, { marketplaceAgentId: directorId });
      message.success('已绑定主管');
      setDirectorModal(null);
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '绑定失败');
    } finally {
      setDirectorSubmitting(false);
    }
  };

  const toggleDefault = async (row: PlatformDepartmentRow, next: boolean): Promise<void> => {
    try {
      await updatePlatformDepartment(row.id, { isDefaultForNewCompany: next });
      message.success('已更新默认部门配置');
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '更新失败');
    }
  };

  const columns: ColumnsType<PlatformDepartmentRow> = [
    {
      title: 'Department',
      key: 'dept',
      render: (_: unknown, r) => (
        <Space direction="vertical" size={0}>
          <Space size={8} wrap>
            <strong>{r.displayName}</strong>
            <Tag>{r.slug}</Tag>
            {r.category ? <Tag color="blue">{r.category}</Tag> : null}
          </Space>
          <span style={{ color: 'rgba(0,0,0,0.45)' }}>Sort: {r.sortOrder}</span>
        </Space>
      ),
    },
    {
      title: '职能 / 标签',
      key: 'capabilities',
      width: 280,
      render: (_: unknown, r) => {
        const summary = String(r.responsibilitySummary ?? '').trim();
        const tags = r.taskTypeTags ?? [];
        if (!summary && !tags.length) {
          return <span style={{ color: 'rgba(0,0,0,0.45)' }}>未配置</span>;
        }
        return (
          <Space direction="vertical" size={4} style={{ maxWidth: 260 }}>
            {summary ? (
              <Tooltip title={summary}>
                <span
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    fontSize: 12,
                  }}
                >
                  {summary}
                </span>
              </Tooltip>
            ) : null}
            {tags.length ? (
              <Space size={4} wrap>
                {tags.slice(0, 4).map((t) => (
                  <Tag key={t} style={{ margin: 0 }}>
                    {t}
                  </Tag>
                ))}
                {tags.length > 4 ? <Tag>+{tags.length - 4}</Tag> : null}
              </Space>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: 'Default for new company',
      dataIndex: 'isDefaultForNewCompany',
      key: 'isDefaultForNewCompany',
      width: 190,
      render: (v: boolean, r) => (
        <Switch checked={Boolean(v)} onChange={(next) => void toggleDefault(r, next)} />
      ),
    },
    {
      title: 'Director (主管)',
      key: 'director',
      width: 260,
      render: (_: unknown, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.director ? `${r.director.name} (${r.director.slug})` : '-'}</span>
          <Button size="small" onClick={() => openDirector(r)}>
            Bind / Change
          </Button>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_: unknown, r) => (
        <Space wrap>
          <Button size="small" onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete department?"
            description="删除后将从平台部门模板移除（注意：可能影响新建公司默认部门）。"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => void submitRemove(r.id)}
          >
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const capabilityModalProps = {
    width: 720,
    styles: { body: { maxHeight: '70vh', overflowY: 'auto' as const } },
  };

  return (
    <div className="erp-page-stack">
      <Card
        title="平台部门模板"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New Department
            </Button>
          </Space>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab((k as 'all' | 'default') ?? 'all')}
          items={[
            { key: 'all', label: '可创建部门列表', children: null },
            { key: 'default', label: '默认部门列表', children: null },
          ]}
        />

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={dataSource}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title="Create Department"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        confirmLoading={createSubmitting}
        okText="Create"
        {...capabilityModalProps}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            label="Slug"
            name="slug"
            rules={[{ required: true, message: '请输入 slug（英文/数字/下划线）' }]}
          >
            <Input placeholder="engineering" />
          </Form.Item>
          <Form.Item
            label="Display name"
            name="displayName"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="工程部" />
          </Form.Item>
          <DepartmentCapabilityFields form={createForm} showFillFromTemplate />
          <Form.Item label="Sort order" name="sortOrder">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label="Default for new company" name="isDefaultForNewCompany" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="Director marketplace agent (主管，可后续再绑定)" name="directorMarketplaceAgentId">
            <Select
              showSearch
              allowClear
              placeholder="Search published marketplace agents..."
              options={directorOptions}
              onSearch={(s) => void searchDirector(s)}
              onDropdownVisibleChange={(open) => {
                if (open && directorOptions.length === 0) void searchDirector('');
              }}
              loading={directorLoading}
              filterOption={false}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Department"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => void submitEdit()}
        confirmLoading={editSubmitting}
        okText="Save"
        {...capabilityModalProps}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="Slug" name="slug">
            <Input />
          </Form.Item>
          <Form.Item label="Display name" name="displayName">
            <Input />
          </Form.Item>
          <DepartmentCapabilityFields form={editForm} showFillFromTemplate />
          <Form.Item label="Sort order" name="sortOrder">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label="Default for new company" name="isDefaultForNewCompany" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={directorModal ? `Bind Director — ${directorModal.displayName}` : 'Bind Director'}
        open={!!directorModal}
        onCancel={() => setDirectorModal(null)}
        onOk={() => void submitDirector()}
        okText="Bind"
        confirmLoading={directorSubmitting}
      >
        <Form layout="vertical">
          <Form.Item label="Director (published marketplace agent)">
            <Select
              showSearch
              placeholder="Search by name / slug"
              value={directorId ?? undefined}
              onChange={(v) => setDirectorId(String(v))}
              options={directorOptions}
              onSearch={(s) => void searchDirector(s)}
              onDropdownVisibleChange={(open) => {
                if (open && directorOptions.length === 0) void searchDirector('');
              }}
              loading={directorLoading}
              filterOption={false}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
