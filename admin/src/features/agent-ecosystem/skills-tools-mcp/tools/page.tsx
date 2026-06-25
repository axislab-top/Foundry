import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { AppstoreOutlined, DeleteOutlined, FilterOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import {
  Avatar,
  Breadcrumb,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd';
import {
  mapApiToolToCard,
  TOOL_RISK_TAG,
  TOOL_STATUS_TAG,
  TOOL_TYPE_LABEL,
  TOOL_TYPE_OPTIONS
} from './data';
import {
  createAdminTool,
  deleteAdminTool,
  getAdminTool,
  getToolUsageImpact,
  listAllAdminTools,
  patchAdminTool,
  type ToolUsageImpact
} from './api';
import {
  buildUpdateToolPayload,
  buildCreateToolPayload,
  isHighRiskProfile,
  type ToolCreateFormValues,
  type ToolEditFormValues
} from './mappers';
import type { ToolRecord, ToolRiskLevel, ToolStatus, ToolType } from './types';

type SortBy = 'recent' | 'calls' | 'name';

export default function ToolsPage(): ReactElement {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchValue, setSearchValue] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ToolStatus[]>([]);
  const [typeFilter, setTypeFilter] = useState<ToolType[]>([]);
  const [riskFilter, setRiskFilter] = useState<ToolRiskLevel[]>([]);
  const [minBindingCount, setMinBindingCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [activeTool, setActiveTool] = useState<ToolRecord | null>(null);
  const [impact, setImpact] = useState<ToolUsageImpact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'edit'>('overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createForm] = Form.useForm<ToolCreateFormValues>();
  const [editForm] = Form.useForm<ToolEditFormValues>();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchKeyword(searchValue.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    let cancelled = false;
    const loadTools = async (): Promise<void> => {
      setLoading(true);
      try {
        const response = await listAllAdminTools({ search: searchKeyword || undefined });
        if (cancelled) return;
        setTools(response.items.map(mapApiToolToCard));
      } catch (err) {
        if (cancelled) return;
        messageApi.error(err instanceof Error ? err.message : String(err));
        setTools([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadTools();
    return () => {
      cancelled = true;
    };
  }, [searchKeyword]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, riskFilter, minBindingCount]);

  const filtered = useMemo(() => {
    const byStatus = (item: ToolRecord): boolean =>
      statusFilter.length ? statusFilter.includes(item.status) : true;
    const byType = (item: ToolRecord): boolean => (typeFilter.length ? typeFilter.includes(item.type) : true);
    const byRisk = (item: ToolRecord): boolean => (riskFilter.length ? riskFilter.includes(item.riskLevel) : true);
    const byBindingCount = (item: ToolRecord): boolean =>
      minBindingCount === null ? true : item.bindCount >= minBindingCount;

    const result = tools.filter(byStatus).filter(byType).filter(byRisk).filter(byBindingCount);

    return [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'calls') return b.bindCount - a.bindCount;
      return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt);
    });
  }, [minBindingCount, riskFilter, sortBy, statusFilter, tools, typeFilter]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, page, pageSize]);

  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const tableColumns = [
    {
      title: 'Tool',
      key: 'tool',
      width: 320,
      render: (_: unknown, record: ToolRecord) => (
        <Space>
          <Avatar>{record.iconText}</Avatar>
          <div>
            <div style={{ fontWeight: 600 }}>
              {record.name}{' '}
              <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                v{record.version}
              </Typography.Text>
            </div>
            <Typography.Text type="secondary">{record.shortDescription}</Typography.Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: ToolType) => TOOL_TYPE_LABEL[type]
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: ToolStatus) => <Tag color={TOOL_STATUS_TAG[status].color}>{TOOL_STATUS_TAG[status].label}</Tag>
    },
    {
      title: 'Risk',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 110,
      render: (risk: ToolRiskLevel) => <Tag color={TOOL_RISK_TAG[risk].color}>{TOOL_RISK_TAG[risk].label}</Tag>
    },
    { title: 'Bound Skills', dataIndex: 'bindCount', key: 'bindCount', width: 110 },
    { title: 'Last Updated', dataIndex: 'lastUpdatedAt', key: 'lastUpdatedAt', width: 120 }
  ];

  const resetFilters = (): void => {
    setStatusFilter([]);
    setTypeFilter([]);
    setRiskFilter([]);
    setMinBindingCount(null);
    setPage(1);
  };

  const openDetail = (tool: ToolRecord): void => {
    setActiveTool(tool);
    setDetailOpen(true);
    setDrawerTab('overview');
    editForm.setFieldsValue({
      displayName: tool.name,
      description: tool.shortDescription,
      inputSchema: JSON.stringify({ type: 'object', properties: {}, required: [] }, null, 2),
      handlerConfig: '',
      outputSchema: '',
      requiredPermissionsCsv: '',
      securityProfile:
        tool.riskLevel === 'high' ? 'shell' : tool.riskLevel === 'medium' ? 'network' : 'safe',
      isEnabled: tool.status === 'active',
      semverVersion: tool.version,
      changeReason: 'Update tool from drawer'
    });
    void (async () => {
      try {
        const detail = await getAdminTool(tool.id);
        const profile = String(detail.securityProfile ?? 'safe');
        editForm.setFieldsValue({
          displayName: String(detail.displayName ?? detail.name ?? tool.name),
          description: String(detail.description ?? tool.shortDescription),
          inputSchema: JSON.stringify(detail.inputSchema ?? { type: 'object', properties: {}, required: [] }, null, 2),
          handlerConfig: detail.handlerConfig ? JSON.stringify(detail.handlerConfig, null, 2) : '',
          outputSchema: detail.outputSchema ? JSON.stringify(detail.outputSchema, null, 2) : '',
          requiredPermissionsCsv: Array.isArray(detail.requiredPermissions) ? detail.requiredPermissions.join(', ') : '',
          securityProfile:
            profile === 'safe' ||
            profile === 'fs-write' ||
            profile === 'network' ||
            profile === 'shell' ||
            profile === 'dangerous'
              ? profile
              : 'safe',
          isEnabled: !!detail.isEnabled,
          semverVersion: String(detail.semverVersion ?? detail.version ?? tool.version ?? '1.0.0'),
          changeReason: 'Update tool from drawer'
        });
      } catch {
        // Keep fallback values.
      }
    })();
    setImpact(null);
    void (async () => {
      try {
        const next = await getToolUsageImpact(tool.id, tool.name);
        setImpact(next);
      } catch {
        setImpact(null);
      }
    })();
  };

  const saveFromDrawer = async (): Promise<void> => {
    if (!activeTool) return;
    try {
      const values = await editForm.validateFields();
      setUpdating(true);
      const updated = await patchAdminTool(activeTool.id, buildUpdateToolPayload(values));
      const mapped = mapApiToolToCard(updated);
      setTools((prev) => prev.map((item) => (item.id === mapped.id ? mapped : item)));
      setActiveTool(mapped);
      messageApi.success('Tool 已更新');
      setDrawerTab('overview');
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdating(false);
    }
  };

  const createTool = async (): Promise<void> => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      const payload = buildCreateToolPayload(values);
      const created = await createAdminTool(payload);
      const mapped = mapApiToolToCard(created);
      setTools((prev) => [mapped, ...prev]);
      setCreateOpen(false);
      createForm.resetFields();
      if (isHighRiskProfile(values.securityProfile)) {
        messageApi.warning('Tool 已创建。当前安全等级较高，后续绑定/发布可能进入审批流程。');
      } else {
        messageApi.success('Tool 创建成功');
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const removeToolFromDrawer = (): void => {
    if (!activeTool) return;
    Modal.confirm({
      title: `删除 Tool：${activeTool.name}`,
      content: `当前 Tool 被 ${activeTool.bindCount} 个配置引用，删除后不可恢复。请确认已完成迁移。`,
      okText: '确认删除',
      okButtonProps: { danger: true, loading: deleting },
      cancelText: '取消',
      onOk: async () => {
        try {
          setDeleting(true);
          await deleteAdminTool(activeTool.id);
          setTools((prev) => prev.filter((item) => item.id !== activeTool.id));
          setDetailOpen(false);
          setActiveTool(null);
          messageApi.success('Tool 已删除');
        } catch (err) {
          messageApi.error(err instanceof Error ? err.message : String(err));
        } finally {
          setDeleting(false);
        }
      }
    });
  };

  return (
    <div className="erp-page-stack">
      {messageContextHolder}
      <Card>
        <Row gutter={[16, 12]} align="middle" justify="space-between">
          <Col xs={24} lg={12}>
            <Space orientation="vertical" size={4}>
              <Breadcrumb
                items={[
                  { title: 'Agent Ecosystem' },
                  { title: 'Skills + Tools / MCP Tools' },
                  { title: 'Tools' }
                ]}
              />
              <Typography.Title level={4} style={{ margin: 0 }}>
                Tools
              </Typography.Title>
            </Space>
          </Col>
          <Col xs={24} lg={12}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }} wrap>
              <Input
                allowClear
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search tools by name, slug, id..."
                style={{ width: 320 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  createForm.setFieldsValue({
                    implementationType: 'builtin',
                    securityProfile: 'safe',
                    inputSchema: JSON.stringify(
                      {
                        type: 'object',
                        properties: {},
                        required: []
                      },
                      null,
                      2
                    ),
                    handlerConfig: '',
                    changeReason: 'Initial tool creation'
                  });
                  setCreateOpen(true);
                }}
              >
                新建 Tool
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} align="top">
        {filtersCollapsed ? null : (
          <Col xs={24} xl={6}>
            <Card
              title={
                <Space size={8}>
                  <FilterOutlined />
                  Filters
                </Space>
              }
              extra={
                <Button size="small" onClick={() => setFiltersCollapsed(true)}>
                  收起
                </Button>
              }
            >
              <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                <div>
                  <Typography.Text type="secondary">Status</Typography.Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Select status"
                    style={{ width: '100%', marginTop: 6 }}
                    options={(Object.keys(TOOL_STATUS_TAG) as ToolStatus[]).map((value) => ({
                      label: TOOL_STATUS_TAG[value].label,
                      value
                    }))}
                    value={statusFilter}
                    onChange={(values) => {
                      setStatusFilter(values as ToolStatus[]);
                      setPage(1);
                    }}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Type</Typography.Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Select type"
                    style={{ width: '100%', marginTop: 6 }}
                    options={TOOL_TYPE_OPTIONS.map((value) => ({ label: TOOL_TYPE_LABEL[value], value }))}
                    value={typeFilter}
                    onChange={(values) => {
                      setTypeFilter(values as ToolType[]);
                      setPage(1);
                    }}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Risk Level</Typography.Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Select risk"
                    style={{ width: '100%', marginTop: 6 }}
                    options={(Object.keys(TOOL_RISK_TAG) as ToolRiskLevel[]).map((value) => ({
                      label: TOOL_RISK_TAG[value].label,
                      value
                    }))}
                    value={riskFilter}
                    onChange={(values) => {
                      setRiskFilter(values as ToolRiskLevel[]);
                      setPage(1);
                    }}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Binding Count</Typography.Text>
                  <Select
                    allowClear
                    placeholder="Min bound count"
                    style={{ width: '100%', marginTop: 6 }}
                    options={[
                      { label: '1+', value: 1 },
                      { label: '5+', value: 5 },
                      { label: '10+', value: 10 },
                      { label: '20+', value: 20 },
                      { label: '30+', value: 30 }
                    ]}
                    value={minBindingCount ?? undefined}
                    onChange={(value) => {
                      setMinBindingCount(typeof value === 'number' ? value : null);
                      setPage(1);
                    }}
                  />
                </div>

                <Divider style={{ margin: '6px 0' }} />
                <Button onClick={resetFilters}>Reset</Button>
              </Space>
            </Card>
          </Col>
        )}

        <Col xs={24} xl={filtersCollapsed ? 24 : 18}>
          <Card>
            <Row gutter={[12, 12]} align="middle" justify="space-between">
              <Col>
                <Space wrap>
                  {filtersCollapsed ? (
                    <Button icon={<FilterOutlined />} onClick={() => setFiltersCollapsed(false)}>
                      Filters
                    </Button>
                  ) : null}
                  <Typography.Text type="secondary">{filtered.length} tools</Typography.Text>
                </Space>
              </Col>
              <Col>
                <Space wrap>
                  <Segmented
                    value={viewMode}
                    onChange={(value) => setViewMode(value as 'card' | 'table')}
                    options={[
                      { label: '卡片', value: 'card', icon: <AppstoreOutlined /> },
                      { label: '表格', value: 'table', icon: <TableOutlined /> }
                    ]}
                  />
                  <Select
                    value={sortBy}
                    onChange={(value) => setSortBy(value)}
                    style={{ width: 180 }}
                    options={[
                      { label: '最近更新', value: 'recent' },
                      { label: '绑定量', value: 'calls' },
                      { label: '名称', value: 'name' }
                    ]}
                  />
                </Space>
              </Col>
            </Row>

            <Divider style={{ margin: '12px 0' }} />

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '36px 0' }}>
                <Spin />
              </div>
            ) : filtered.length === 0 ? (
              <Empty description="No tools match your filters." />
            ) : viewMode === 'table' ? (
              <Table<ToolRecord>
                rowKey="id"
                size="middle"
                dataSource={pagedData}
                columns={tableColumns}
                pagination={{
                  current: page,
                  pageSize,
                  total: filtered.length,
                  showSizeChanger: true,
                  onChange: (nextPage, nextPageSize) => {
                    setPage(nextPage);
                    setPageSize(nextPageSize);
                  }
                }}
                onRow={(record) => ({
                  onClick: () => openDetail(record),
                  style: { cursor: 'pointer' }
                })}
              />
            ) : (
              <>
                <Row gutter={[16, 16]}>
                  {pagedData.map((tool) => (
                    <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={6} key={tool.id}>
                      <Card hoverable styles={{ body: { minHeight: 220 } }} onClick={() => openDetail(tool)}>
                        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                          <Row align="top" justify="space-between" gutter={[8, 8]}>
                            <Col flex="auto">
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <Avatar>{tool.iconText}</Avatar>
                                <div style={{ minWidth: 0 }}>
                                  <Typography.Paragraph
                                    strong
                                    style={{ marginBottom: 2, lineHeight: 1.4, wordBreak: 'break-word' }}
                                  >
                                    {tool.name}{' '}
                                    <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                                      v{tool.version}
                                    </Typography.Text>
                                  </Typography.Paragraph>
                                  <Typography.Text type="secondary">{TOOL_TYPE_LABEL[tool.type]}</Typography.Text>
                                </div>
                              </div>
                            </Col>
                            <Col flex="none">
                              <Tag color={TOOL_STATUS_TAG[tool.status].color}>
                                {TOOL_STATUS_TAG[tool.status].label}
                              </Tag>
                            </Col>
                          </Row>

                          <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                            {tool.shortDescription}
                          </Typography.Paragraph>

                          <Space size={[6, 6]} wrap>
                            <Tag color={TOOL_RISK_TAG[tool.riskLevel].color}>
                              Risk {TOOL_RISK_TAG[tool.riskLevel].label}
                            </Tag>
                            <Tag>Bindings {tool.bindCount}</Tag>
                          </Space>
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <Pagination
                    current={page}
                    pageSize={pageSize}
                    total={filtered.length}
                    showSizeChanger
                    onChange={(nextPage, nextPageSize) => {
                      setPage(nextPage);
                      setPageSize(nextPageSize);
                    }}
                  />
                </div>
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Drawer
        title={activeTool ? `${activeTool.name} 详情` : 'Tool 详情'}
        open={detailOpen}
        size="large"
        onClose={() => setDetailOpen(false)}
      >
        {activeTool ? (
          <Tabs
            activeKey={drawerTab}
            onChange={(key) => setDrawerTab(key as 'overview' | 'edit')}
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                    <Space>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        loading={deleting}
                        onClick={() => removeToolFromDrawer()}
                      >
                        删除 Tool
                      </Button>
                    </Space>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      Tool 实时信息与引用影响。
                    </Typography.Paragraph>
                    <Row gutter={[12, 12]}>
                      <Col span={12}>
                        <Statistic title="Bound Skills" value={activeTool.bindCount} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="Version" value={activeTool.version} />
                      </Col>
                    </Row>
                    <div>
                      <Typography.Text type="secondary">Tool ID</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0 }}>{activeTool.id}</Typography.Paragraph>
                    </div>
                    <Space wrap>
                      <Tag color={TOOL_STATUS_TAG[activeTool.status].color}>{TOOL_STATUS_TAG[activeTool.status].label}</Tag>
                      <Tag color={TOOL_RISK_TAG[activeTool.riskLevel].color}>{TOOL_RISK_TAG[activeTool.riskLevel].label}</Tag>
                      <Tag>{TOOL_TYPE_LABEL[activeTool.type]}</Tag>
                    </Space>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>{activeTool.shortDescription}</Typography.Paragraph>
                    <div>
                      <Typography.Text type="secondary">引用影响</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0 }}>
                        当前被 {activeTool.bindCount} 个配置引用（Skill/Agent 绑定汇总）。停用或删除前请先确认迁移计划。
                      </Typography.Paragraph>
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        Marketplace 引用: {impact?.marketplaceRefs ?? '-'}，Pinned 引用: {impact?.pinnedRefs ?? '-'}，Skill 绑定: {impact?.skillBindings ?? '-'}
                      </Typography.Paragraph>
                    </div>
                  </Space>
                )
              },
              {
                key: 'edit',
                label: 'Edit',
                children: (
                  <Form form={editForm} layout="vertical">
                    <Typography.Title level={5}>Basic</Typography.Title>
                    <Form.Item
                      name="displayName"
                      label="Display Name"
                      rules={[{ required: true, message: '请输入展示名' }]}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="description"
                      label="Description"
                      rules={[{ required: true, message: '请输入描述' }]}
                    >
                      <Input.TextArea rows={4} />
                    </Form.Item>
                    <Form.Item name="semverVersion" label="Semver Version">
                      <Input placeholder="1.0.0" />
                    </Form.Item>

                    <Divider />
                    <Typography.Title level={5}>Runtime</Typography.Title>
                    <Form.Item
                      name="inputSchema"
                      label="Input Schema (JSON)"
                      rules={[{ required: true, message: '请输入 Input Schema' }]}
                    >
                      <Input.TextArea rows={8} />
                    </Form.Item>
                    <Form.Item name="handlerConfig" label="Handler Config (JSON, optional)">
                      <Input.TextArea rows={6} placeholder='{"endpoint":"https://memory.example.com/search","method":"POST","timeoutMs":12000}' />
                    </Form.Item>
                    <Form.Item name="outputSchema" label="Output Schema (JSON, optional)">
                      <Input.TextArea rows={5} />
                    </Form.Item>
                    <Form.Item name="requiredPermissionsCsv" label="Required Permissions (comma separated)">
                      <Input placeholder="tool:read, file:write" />
                    </Form.Item>

                    <Divider />
                    <Typography.Title level={5}>Security & Limits</Typography.Title>
                    <Form.Item
                      name="securityProfile"
                      label="Security Profile"
                      rules={[{ required: true, message: '请选择安全等级' }]}
                    >
                      <Select
                        options={[
                          { label: 'safe', value: 'safe' },
                          { label: 'fs-write', value: 'fs-write' },
                          { label: 'network', value: 'network' },
                          { label: 'shell', value: 'shell' },
                          { label: 'dangerous', value: 'dangerous' }
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="isEnabled" label="Enabled" valuePropName="checked">
                      <Switch />
                    </Form.Item>

                    <Divider />
                    <Typography.Title level={5}>Governance</Typography.Title>
                    <Form.Item
                      name="changeReason"
                      label="Change Reason"
                      rules={[{ required: true, message: '请填写变更原因' }]}
                    >
                      <Input />
                    </Form.Item>
                    <Button type="primary" loading={updating} onClick={() => void saveFromDrawer()}>
                      保存修改
                    </Button>
                  </Form>
                )
              }
            ]}
          />
        ) : null}
      </Drawer>
      <Modal
        title="新建 Tool"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => {
          void createTool();
        }}
        okText="创建"
        confirmLoading={creating}
        width={760}
      >
        <Form form={createForm} layout="vertical" initialValues={{ implementationType: 'builtin', securityProfile: 'safe', changeReason: 'Initial tool creation' }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="Name (slug)" rules={[{ required: true, message: '请输入 name' }]}>
                <Input placeholder="http-client-v2" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="displayName"
                label="Display Name"
                rules={[{ required: true, message: '请输入展示名' }]}
              >
                <Input placeholder="HTTP Client V2" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description" rules={[{ required: true, message: '请输入描述' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="implementationType"
                label="Implementation Type"
                rules={[]}
              >
                <Select
                  options={[
                    { label: 'builtin', value: 'builtin' },
                    { label: 'langgraph', value: 'langgraph' },
                    { label: 'api', value: 'api' },
                    { label: 'external', value: 'external' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="securityProfile"
                label="Security Profile"
                rules={[{ required: true, message: '请选择安全等级' }]}
              >
                <Select
                  options={[
                    { label: 'safe', value: 'safe' },
                    { label: 'fs-write', value: 'fs-write' },
                    { label: 'network', value: 'network' },
                    { label: 'shell', value: 'shell' },
                    { label: 'dangerous', value: 'dangerous' }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="inputSchema" label="Input Schema (JSON)" rules={[{ required: true }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name="handlerConfig" label="Handler Config (JSON, optional)">
            <Input.TextArea rows={6} placeholder='{"endpoint":"https://memory.example.com/search","method":"POST"}' />
          </Form.Item>
          <Form.Item name="changeReason" label="Change Reason" rules={[{ required: true, message: '请填写变更原因' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

