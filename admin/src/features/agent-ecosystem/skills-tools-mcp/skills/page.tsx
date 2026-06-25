import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { AppstoreOutlined, FilterOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import { Alert, Avatar, Breadcrumb, Button, Card, Col, Divider, Empty, Form, Input, Modal, Pagination, Row, Segmented, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import {
  createAdminSkill,
  deleteAdminSkill,
  getAdminSkill,
  listAllAdminSkills,
  listMcpToolsCatalog,
  listToolsCatalog,
  parseAdminSkillMd,
  patchAdminSkill,
  replaceSkillMcpToolBindings,
  replaceSkillToolBindings,
  type ApiSkillDetail,
  type ApiSkillRecord,
  type BindingPickerOption
} from './api';
import {
  bindingChangeReason,
  bindingsFromApiDetail,
  mergeBindingsIntoSnapshot,
  toMcpBindingsPayload,
  toToolBindingsPayload
} from './bindingPersistence';
import { CATEGORY_OPTIONS, createDetailDraftFromApi, DEPARTMENT_OPTIONS, mapApiSkillToCard, RISK_TAG, STATUS_TAG } from './data';
import { SkillBindingsPickerModal } from './components/SkillBindingsPickerModal';
import { SkillDetailDrawer } from './components/SkillDetailDrawer';
import { SkillMdUploadFill, type SkillMdParsedPayload } from './components/SkillMdUploadFill';
import type { BoundTool, RiskLevel, Skill, SkillDetailDraft, SkillStatus } from './types';

export default function SkillsPage(): ReactElement {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchValue, setSearchValue] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'usage' | 'name'>('recent');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsApiMap, setSkillsApiMap] = useState<Record<string, ApiSkillRecord>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Partial<Record<'changeReason', string>>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<{
    name: string;
    displayName: string;
    description?: string;
    promptTemplate: string;
    securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
    changeReason: string;
  }>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const loadRequestIdRef = useRef(0);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [detailDraft, setDetailDraft] = useState<SkillDetailDraft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [activeDrawerTab, setActiveDrawerTab] = useState<'governance' | 'skillMd' | 'bindings'>('skillMd');
  const [activeBindingTab, setActiveBindingTab] = useState<'tools' | 'mcpTools'>('tools');
  const [addModalTarget, setAddModalTarget] = useState<'tool' | 'mcp' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedPickerIds, setSelectedPickerIds] = useState<string[]>([]);
  const [toolCatalog, setToolCatalog] = useState<BindingPickerOption[]>([]);
  const [mcpCatalog, setMcpCatalog] = useState<BindingPickerOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [bindingSaving, setBindingSaving] = useState(false);
  const [savingContent, setSavingContent] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<SkillStatus[]>([]);
  const [riskFilter, setRiskFilter] = useState<RiskLevel[]>([]);
  const [minBindingAgents, setMinBindingAgents] = useState<number | null>(null);
  const filtered = useMemo(() => {
    const byCategory = (skill: Skill): boolean =>
      categoryFilter.length ? categoryFilter.includes(skill.category) : true;
    const byDept = (skill: Skill): boolean =>
      departmentFilter.length
        ? departmentFilter.some((dep) => skill.departments.includes(dep) || (dep === '全公司' && skill.departments.length))
        : true;
    const byStatus = (skill: Skill): boolean => (statusFilter.length ? statusFilter.includes(skill.status) : true);
    const byRisk = (skill: Skill): boolean => (riskFilter.length ? riskFilter.includes(skill.riskLevel) : true);
    const byBindings = (skill: Skill): boolean =>
      minBindingAgents === null ? true : skill.bindingAgents >= minBindingAgents;

    const result = skills
      .filter(byCategory)
      .filter(byDept)
      .filter(byStatus)
      .filter(byRisk)
      .filter(byBindings);

    const sorted = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'usage') return b.monthlyCalls - a.monthlyCalls;
      return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt);
    });

    return sorted;
  }, [
    categoryFilter,
    departmentFilter,
    minBindingAgents,
    riskFilter,
    skills,
    sortBy,
    statusFilter
  ]);

  const pagedFiltered = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const activeSkill = useMemo(
    () => (activeSkillId ? skills.find((skill) => skill.id === activeSkillId) ?? null : null),
    [activeSkillId, skills]
  );

  const loadSkills = async (): Promise<void> => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const resolvedStatus = statusFilter.length === 1 ? statusFilter[0] : null;
      const isEnabled = resolvedStatus === 'active' ? true : resolvedStatus === 'draft' ? false : undefined;
      const approvalStatus =
        resolvedStatus === 'in_review'
          ? 'pending'
          : resolvedStatus === 'deprecated'
            ? 'rejected'
            : resolvedStatus === 'active'
              ? 'approved'
              : undefined;

      const response = await listAllAdminSkills({
        search: searchKeyword || undefined,
        isEnabled,
        approvalStatus: resolvedStatus ? approvalStatus : undefined
      });
      if (requestId !== loadRequestIdRef.current) return;

      const items = response.items ?? [];
      setSkills(items.map(mapApiSkillToCard));
      setSkillsApiMap(Object.fromEntries(items.map((item) => [item.id, item])));
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) return;
      const next = err instanceof Error ? err.message : String(err);
      setError(next);
      messageApi.error(next);
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchKeyword(searchValue.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    void loadSkills();
  }, [searchKeyword, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, departmentFilter, riskFilter, minBindingAgents, statusFilter]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, page, pageSize]);

  const openDetail = async (skill: Skill): Promise<void> => {
    setActiveSkillId(skill.id);
    setDetailOpen(true);
    setDetailDraft(null);
    try {
      const detail = await getAdminSkill(skill.id);
      const draft = createDetailDraftFromApi(detail);
      setDetailDraft(draft);
      setSavedSnapshot(JSON.stringify(draft));
      setActiveDrawerTab('skillMd');
      setActiveBindingTab('tools');
    } catch (err) {
      const next = err instanceof Error ? err.message : String(err);
      messageApi.error(next);
      setDetailOpen(false);
      setActiveSkillId(null);
    }
  };

  const hasUnsavedContentChanges = !!detailDraft && JSON.stringify(detailDraft) !== savedSnapshot;

  const applyBindingsFromApi = (detail: ApiSkillDetail): void => {
    const bindings = bindingsFromApiDetail(detail);
    setDetailDraft((prev) => (prev ? { ...prev, ...bindings } : prev));
    setSavedSnapshot((prev) => mergeBindingsIntoSnapshot(prev, bindings));
  };

  const persistBindings = async (
    target: 'tool' | 'mcp',
    nextTools: BoundTool[],
    nextMcp: BoundTool[],
    successMessage: string
  ): Promise<boolean> => {
    if (!activeSkillId || !detailDraft) return false;
    setBindingSaving(true);
    try {
      const changeReason = bindingChangeReason(detailDraft);
      const detail =
        target === 'tool'
          ? await replaceSkillToolBindings(activeSkillId, {
              bindings: toToolBindingsPayload(nextTools),
              changeReason
            })
          : await replaceSkillMcpToolBindings(activeSkillId, {
              bindings: toMcpBindingsPayload(nextMcp),
              changeReason
            });
      applyBindingsFromApi(detail);
      messageApi.success(successMessage);
      return true;
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBindingSaving(false);
    }
  };

  const requestCloseDetail = (): void => {
    if (hasUnsavedContentChanges) {
      Modal.confirm({
        title: '有未保存的内容变更',
        content: 'SKILL.md 或治理设置尚未保存。Tool / MCP 绑定已自动保存，关闭不会丢失绑定。',
        okText: '仍要关闭',
        cancelText: '继续编辑',
        onOk: () => setDetailOpen(false)
      });
      return;
    }
    setDetailOpen(false);
  };

  const updateDraftField = <K extends keyof SkillDetailDraft>(key: K, value: SkillDetailDraft[K]): void => {
    setDetailDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const startAddBindings = (target: 'tool' | 'mcp'): void => {
    setAddModalTarget(target);
    setPickerSearch('');
    setSelectedPickerIds([]);
  };

  useEffect(() => {
    if (!addModalTarget) return;
    if (toolCatalog.length || mcpCatalog.length) return;
    let cancelled = false;
    const loadCatalog = async (): Promise<void> => {
      setCatalogLoading(true);
      try {
        const [tools, mcpTools] = await Promise.all([listToolsCatalog(), listMcpToolsCatalog()]);
        if (cancelled) return;
        setToolCatalog(tools);
        setMcpCatalog(mcpTools);
      } catch (err) {
        if (cancelled) return;
        messageApi.error(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [addModalTarget, mcpCatalog.length, messageApi, toolCatalog.length]);

  const parseSkillMdForForm = async (raw: string) => {
    const res = await parseAdminSkillMd(raw);
    return { issues: res.issues ?? [], payload: res.payload };
  };

  const validateSkillMdRemote = async (
    raw: string
  ): Promise<{ ok: boolean; issues: Array<{ field: string; message: string }> }> => {
    const res = await parseSkillMdForForm(raw);
    return { ok: !res.issues.length && !!res.payload, issues: res.issues };
  };

  const applyParsedToCreateForm = (payload: SkillMdParsedPayload): void => {
    createForm.setFieldsValue({
      name: payload.name,
      displayName: payload.displayName || payload.name,
      description: payload.description,
      promptTemplate: payload.promptTemplate
    });
    messageApi.success('已从 SKILL.md 填充表单，请核对后提交');
  };

  const saveDraft = async (): Promise<void> => {
    if (!detailDraft || !activeSkillId) return;
    const nextValidationErrors: Partial<Record<'changeReason', string>> = {};
    if (!detailDraft.changeReason.trim()) nextValidationErrors.changeReason = 'Change Reason is required';
    if (!detailDraft.skillMd.trim()) {
      messageApi.error('SKILL.md 不能为空');
      return;
    }
    if (Object.keys(nextValidationErrors).length) {
      setValidationErrors(nextValidationErrors);
      messageApi.error('请先修正必填项');
      return;
    }
    const check = await validateSkillMdRemote(detailDraft.skillMd);
    if (!check.ok) {
      messageApi.error(check.issues.map((i) => `${i.field}: ${i.message}`).join('; '));
      return;
    }
    setValidationErrors({});
    const payload: Record<string, unknown> = {
      skillMd: detailDraft.skillMd,
      isEnabled: detailDraft.statusBadge === 'Active',
      changeReason: detailDraft.changeReason.trim() || 'Update skill from Skills admin page'
    };
    try {
      setSavingContent(true);
      await patchAdminSkill(activeSkillId, payload);
      const detail = await getAdminSkill(activeSkillId);
      const draft = createDetailDraftFromApi(detail);
      setDetailDraft(draft);
      const mapped = mapApiSkillToCard(detail.skill);
      setSkills((prev) => prev.map((item) => (item.id === mapped.id ? mapped : item)));
      setSkillsApiMap((prev) => ({ ...prev, [detail.skill.id]: detail.skill }));
      setSavedSnapshot(JSON.stringify(draft));
      messageApi.success('Skill 内容已保存');
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingContent(false);
    }
  };

  const createSkill = async (): Promise<void> => {
    try {
      const values = await createForm.validateFields();
      setSubmitting(true);
      await createAdminSkill({
        name: values.name.trim(),
        displayName: values.displayName.trim(),
        description: values.description?.trim() || null,
        promptTemplate: values.promptTemplate.trim(),
        securityProfile: values.securityProfile,
        changeReason: values.changeReason.trim(),
        requiredPermissions: [],
        category: [],
        icon: null
      });
      messageApi.success('Skill 创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      setPage(1);
      await loadSkills();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const removeSkill = async (): Promise<void> => {
    if (!activeSkillId) return;
    try {
      setDeleting(true);
      await deleteAdminSkill(activeSkillId);
      messageApi.success('Skill 已删除');
      setDetailOpen(false);
      setActiveSkillId(null);
      await loadSkills();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const selectedLibrary = addModalTarget === 'mcp' ? mcpCatalog : toolCatalog;
  const filteredLibrary = selectedLibrary.filter((item) => {
    const needle = pickerSearch.trim().toLowerCase();
    if (!needle) return true;
    return `${item.name} ${item.id} ${item.version}`.toLowerCase().includes(needle);
  });

  const onConfirmAddBindings = async (): Promise<void> => {
    if (!addModalTarget || !detailDraft || !selectedPickerIds.length || bindingSaving) return;
    const source = addModalTarget === 'mcp' ? mcpCatalog : toolCatalog;
    const selectedItems = source
      .filter((item) => selectedPickerIds.includes(item.id))
      .map((item) => ({
        id: String(item.id),
        name: item.name,
        version: item.version,
        overridden: false
      }));
    const current = addModalTarget === 'mcp' ? detailDraft.boundMcpTools : detailDraft.boundTools;
    const existing = new Set(current.map((item) => `${item.name}@${item.version}`));
    const deduped = selectedItems.filter((item) => !existing.has(`${item.name}@${item.version}`));
    if (!deduped.length) {
      setAddModalTarget(null);
      return;
    }
    const nextList = [...current, ...deduped];
    const ok = await persistBindings(
      addModalTarget === 'mcp' ? 'mcp' : 'tool',
      addModalTarget === 'tool' ? nextList : detailDraft.boundTools,
      addModalTarget === 'mcp' ? nextList : detailDraft.boundMcpTools,
      addModalTarget === 'mcp' ? 'MCP Tool 绑定已保存' : 'Tool 绑定已保存'
    );
    if (ok) setAddModalTarget(null);
  };

  const toggleOverride = async (target: 'tool' | 'mcp', id: string): Promise<void> => {
    if (!detailDraft || bindingSaving) return;
    const nextTools =
      target === 'tool'
        ? detailDraft.boundTools.map((item) => (item.id === id ? { ...item, overridden: !item.overridden } : item))
        : detailDraft.boundTools;
    const nextMcp =
      target === 'mcp'
        ? detailDraft.boundMcpTools.map((item) => (item.id === id ? { ...item, overridden: !item.overridden } : item))
        : detailDraft.boundMcpTools;
    await persistBindings(target, nextTools, nextMcp, '绑定配置已更新');
  };

  const removeBinding = async (target: 'tool' | 'mcp', id: string): Promise<void> => {
    if (!detailDraft || bindingSaving) return;
    const nextTools = target === 'tool' ? detailDraft.boundTools.filter((item) => item.id !== id) : detailDraft.boundTools;
    const nextMcp =
      target === 'mcp' ? detailDraft.boundMcpTools.filter((item) => item.id !== id) : detailDraft.boundMcpTools;
    await persistBindings(target, nextTools, nextMcp, '绑定已移除');
  };

  const moveBinding = async (target: 'tool' | 'mcp', sourceId: string, targetId: string): Promise<void> => {
    if (!detailDraft || bindingSaving) return;
    const current = target === 'mcp' ? detailDraft.boundMcpTools : detailDraft.boundTools;
    const from = current.findIndex((item) => item.id === sourceId);
    const to = current.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    await persistBindings(
      target,
      target === 'tool' ? next : detailDraft.boundTools,
      target === 'mcp' ? next : detailDraft.boundMcpTools,
      '绑定顺序已更新'
    );
  };

  const tableColumns = [
    {
      title: 'Skill',
      key: 'skill',
      width: 320,
      render: (_: unknown, record: Skill) => (
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
    { title: 'Last Updated', dataIndex: 'lastUpdatedAt', key: 'lastUpdatedAt', width: 130 },
    { title: 'Created By', dataIndex: 'createdBy', key: 'createdBy', width: 190 },
    {
      title: 'Total Bindings',
      key: 'totalBindings',
      width: 130,
      render: (_: unknown, record: Skill) =>
        record.bindingAgents + record.bindingTools + record.bindingMcpTools
    },
    {
      title: 'Monthly Cost',
      dataIndex: 'monthlyCostUsd',
      key: 'monthlyCostUsd',
      width: 120,
      render: (value: number) => `$${value.toFixed(2)}`
    },
    {
      title: 'Risk Score',
      dataIndex: 'riskScore',
      key: 'riskScore',
      width: 110
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: SkillStatus) => <Tag color={STATUS_TAG[status].color}>{STATUS_TAG[status].label}</Tag>
    }
  ];

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
                  { title: 'Skills' }
                ]}
              />
              <Typography.Title level={4} style={{ margin: 0 }}>
                Skills
              </Typography.Title>
            </Space>
          </Col>
          <Col xs={24} lg={12}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }} wrap>
              <Input
                allowClear
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search skills by name, slug, id..."
                style={{ width: 280 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  createForm.setFieldsValue({
                    securityProfile: 'safe',
                    changeReason: 'Initial skill creation',
                    promptTemplate:
                      'You are a helpful enterprise skill. Follow policy boundaries and return concise, actionable outputs.'
                  });
                  setCreateOpen(true);
                }}
              >
                新建 Skill
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {error ? <Alert type="error" showIcon title="技能数据加载失败" description={error} /> : null}

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
                  <Typography.Text type="secondary">Category</Typography.Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Select category"
                    style={{ width: '100%', marginTop: 6 }}
                    options={CATEGORY_OPTIONS.map((value) => ({ label: value, value }))}
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Department</Typography.Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Select department"
                    style={{ width: '100%', marginTop: 6 }}
                    options={DEPARTMENT_OPTIONS.map((value) => ({ label: value, value }))}
                    value={departmentFilter}
                    onChange={setDepartmentFilter}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Status</Typography.Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Select status"
                    style={{ width: '100%', marginTop: 6 }}
                    options={(Object.keys(STATUS_TAG) as SkillStatus[]).map((value) => ({
                      label: STATUS_TAG[value].label,
                      value
                    }))}
                    value={statusFilter}
                    onChange={(values) => setStatusFilter(values as SkillStatus[])}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Risk Level</Typography.Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Select risk"
                    style={{ width: '100%', marginTop: 6 }}
                    options={(Object.keys(RISK_TAG) as RiskLevel[]).map((value) => ({
                      label: RISK_TAG[value].label,
                      value
                    }))}
                    value={riskFilter}
                    onChange={(values) => setRiskFilter(values as RiskLevel[])}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Binding Count（Agents）</Typography.Text>
                  <Select
                    allowClear
                    placeholder="Min bound agents"
                    style={{ width: '100%', marginTop: 6 }}
                    options={[
                      { label: '0+', value: 0 },
                      { label: '1+', value: 1 },
                      { label: '5+', value: 5 },
                      { label: '10+', value: 10 },
                      { label: '20+', value: 20 }
                    ]}
                    value={minBindingAgents ?? undefined}
                    onChange={(value) => setMinBindingAgents(typeof value === 'number' ? value : null)}
                  />
                </div>

                <Divider style={{ margin: '6px 0' }} />
                <Space wrap>
                  <Button
                    onClick={() => {
                      setCategoryFilter([]);
                      setDepartmentFilter([]);
                      setStatusFilter([]);
                      setRiskFilter([]);
                      setMinBindingAgents(null);
                    }}
                  >
                    Reset
                  </Button>
                </Space>
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
                  <Typography.Text type="secondary">{filtered.length} skills</Typography.Text>
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
                      { label: '使用频率', value: 'usage' },
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
              <Empty description="No skills match your filters." />
            ) : viewMode === 'table' ? (
              <Table<Skill>
                rowKey="id"
                size="middle"
                dataSource={pagedFiltered}
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
                  onClick: () => {
                    void openDetail(record);
                  },
                  style: { cursor: 'pointer' }
                })}
              />
            ) : (
              <Row gutter={[16, 16]}>
                {pagedFiltered.map((skill) => {
                  const status = STATUS_TAG[skill.status];
                  const deptPreview = skill.departments.slice(0, 2);
                  return (
                    <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={6} key={skill.id}>
                      <Card
                        hoverable
                        styles={{ body: { minHeight: 200 } }}
                        onClick={() => {
                          void openDetail(skill);
                        }}
                      >
                        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                          <Row align="top" justify="space-between" gutter={[8, 8]}>
                            <Col flex="auto">
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <Avatar>{skill.iconText}</Avatar>
                                <div style={{ minWidth: 0 }}>
                                  <Typography.Paragraph
                                    strong
                                    style={{ marginBottom: 2, lineHeight: 1.4, wordBreak: 'break-word' }}
                                  >
                                    {skill.name}{' '}
                                    <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                                      v{skill.version}
                                    </Typography.Text>
                                  </Typography.Paragraph>
                                  <Typography.Text type="secondary">{skill.category}</Typography.Text>
                                </div>
                              </div>
                            </Col>
                            <Col flex="none">
                              <Tag color={status.color}>{status.label}</Tag>
                            </Col>
                          </Row>

                          <Typography.Paragraph
                            type="secondary"
                            ellipsis={{ rows: 2 }}
                            style={{ marginBottom: 0 }}
                          >
                            {skill.shortDescription}
                          </Typography.Paragraph>

                          <Space size={[6, 6]} wrap>
                            <Tag color={RISK_TAG[skill.riskLevel].color}>Risk {RISK_TAG[skill.riskLevel].label}</Tag>
                            {deptPreview.map((dep) => (
                              <Tag key={dep} color="blue">
                                {dep}
                              </Tag>
                            ))}
                            {skill.departments.length > deptPreview.length ? (
                              <Tag color="default">+{skill.departments.length - deptPreview.length}</Tag>
                            ) : null}
                          </Space>
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            )}
            {!loading && filtered.length > 0 && viewMode === 'card' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
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
            ) : null}
          </Card>
        </Col>
      </Row>

      <SkillDetailDrawer
        activeSkill={activeSkill}
        detailDraft={detailDraft}
        detailOpen={detailOpen}
        hasUnsavedContentChanges={hasUnsavedContentChanges}
        bindingSaving={bindingSaving}
        savingContent={savingContent}
        activeDrawerTab={activeDrawerTab}
        activeBindingTab={activeBindingTab}
        onClose={requestCloseDetail}
        onSave={() => {
          void saveDraft();
        }}
        onDrawerTabChange={setActiveDrawerTab}
        onBindingTabChange={setActiveBindingTab}
        onFieldUpdate={updateDraftField}
        onToggleOverride={(target, id) => {
          void toggleOverride(target, id);
        }}
        onRemoveBinding={(target, id) => {
          void removeBinding(target, id);
        }}
        onMoveBinding={(target, sourceId, targetId) => {
          void moveBinding(target, sourceId, targetId);
        }}
        onStartAddBindings={startAddBindings}
        onValidateSkillMd={validateSkillMdRemote}
        onDelete={() => {
          void removeSkill();
        }}
        deleting={deleting}
        validationErrors={validationErrors}
      />
      <SkillBindingsPickerModal
        target={addModalTarget}
        searchValue={pickerSearch}
        selectedIds={selectedPickerIds}
        options={filteredLibrary}
        loading={catalogLoading}
        confirmLoading={bindingSaving}
        onSearchChange={setPickerSearch}
        onSelectedIdsChange={setSelectedPickerIds}
        onCancel={() => setAddModalTarget(null)}
        onConfirm={() => {
          void onConfirmAddBindings();
        }}
      />
      <Modal
        title="新建 Skill"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => {
          void createSkill();
        }}
        okText="创建"
        confirmLoading={submitting}
        width={720}
      >
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <SkillMdUploadFill
            onParse={parseSkillMdForForm}
            onApply={applyParsedToCreateForm}
            onError={(msg) => messageApi.error(msg)}
          />
          <Divider style={{ margin: 0 }} />
          <Form
            form={createForm}
            layout="vertical"
            initialValues={{ securityProfile: 'safe', changeReason: 'Initial skill creation' }}
          >
            <Form.Item name="name" label="Name (slug)" rules={[{ required: true, message: '请输入 name' }]}>
              <Input placeholder="director-task-delegator" />
            </Form.Item>
            <Form.Item name="displayName" label="Display Name" rules={[{ required: true, message: '请输入展示名' }]}>
              <Input placeholder="Director Task Delegator" />
            </Form.Item>
            <Form.Item name="description" label="Description" rules={[{ required: true, message: '请输入描述' }]}>
              <Input.TextArea rows={2} placeholder="简短说明：做什么、何时使用（对应 SKILL.md frontmatter description）" />
            </Form.Item>
            <Form.Item
              name="promptTemplate"
              label="指令正文"
              rules={[{ required: true, message: '请输入指令正文' }]}
              extra="对应 SKILL.md 中 frontmatter 以下的 Markdown 正文，写入运行时 prompt_template。"
            >
              <Input.TextArea rows={8} placeholder="何时使用、步骤、输出格式、边界…" />
            </Form.Item>
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
            <Form.Item name="changeReason" label="Change Reason" rules={[{ required: true, message: '请填写变更原因' }]}>
              <Input />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </div>
  );
}

