import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { useCompany } from '../../contexts/CompanyContext';
import { listMarketplaceAgents } from '../../services/marketplaceApi';
import {
  approveMarketplaceHireRequest,
  createMarketplaceHireRequest,
  listMarketplaceHireRequests,
  rejectMarketplaceHireRequest,
  type MarketplaceHireRequest,
} from '../../services/marketplaceHireApi';
import { getOrganizationTree, type OrganizationTreeNode } from '../../services/organizationApi';

function collectEmptyAgentNodes(nodes: OrganizationTreeNode[]): OrganizationTreeNode[] {
  const out: OrganizationTreeNode[] = [];
  const walk = (arr: OrganizationTreeNode[]) => {
    for (const n of arr) {
      if (n.type === 'agent' && !n.agentId) {
        out.push(n);
      }
      if (n.children?.length) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  pending: { color: 'gold', label: '待审批' },
  /** 抢占待处理：事件已认领，安装/MQ 进行中 */
  approved: { color: 'blue', label: '处理中' },
  rejected: { color: 'default', label: '已驳回' },
  completed: { color: 'green', label: '已完成' },
  failed: { color: 'red', label: '失败' },
};

export const MarketplaceHirePage: React.FC = () => {
  const { companyId, isLoading: companiesLoading } = useCompany();
  const tenantReady = Boolean(companyId) && !companiesLoading;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [skillTags, setSkillTags] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [rejectRow, setRejectRow] = useState<MarketplaceHireRequest | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [form] = Form.useForm();

  const treeQ = useQuery({
    queryKey: ['organization', 'tree', companyId],
    queryFn: getOrganizationTree,
    enabled: tenantReady,
  });

  const emptySlots = useMemo(
    () => (treeQ.data ? collectEmptyAgentNodes(treeQ.data) : []),
    [treeQ.data],
  );

  const catalogQ = useQuery({
    queryKey: ['marketplace', 'catalog', companyId, search, skillTags],
    queryFn: () =>
      listMarketplaceAgents({
        page: 1,
        pageSize: 50,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(skillTags.trim() ? { skillTags: skillTags.trim() } : {}),
      }),
    enabled: tenantReady,
  });

  const hiresQ = useQuery({
    queryKey: ['marketplace', 'hires', companyId],
    queryFn: () => listMarketplaceHireRequests(companyId!, { page: 1, pageSize: 50 }),
    enabled: tenantReady && Boolean(companyId),
  });

  const createMut = useMutation({
    mutationFn: (values: { marketplaceAgentId: string; organizationNodeId: string; requestedReason?: string }) =>
      createMarketplaceHireRequest(companyId!, values),
    onSuccess: () => {
      message.success('已提交招聘申请');
      setApplyOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['marketplace', 'hires', companyId] });
    },
    onError: (e: Error) => message.error(e.message || '提交失败'),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveMarketplaceHireRequest(companyId!, id),
    onSuccess: () => {
      message.success('已批准安装');
      void qc.invalidateQueries({ queryKey: ['marketplace', 'hires', companyId] });
      void qc.invalidateQueries({ queryKey: ['agents', 'list'] });
    },
    onError: (e: Error) => message.error(e.message || '操作失败'),
  });

  const rejectMut = useMutation({
    mutationFn: (p: { id: string; reason?: string; cancelStalled?: boolean }) =>
      rejectMarketplaceHireRequest(companyId!, p.id, { rejectReason: p.reason }),
    onSuccess: (_data, vars) => {
      message.success(vars.cancelStalled ? '已取消处理中的安装' : '已驳回');
      void qc.invalidateQueries({ queryKey: ['marketplace', 'hires', companyId] });
    },
    onError: (e: Error) => message.error(e.message || '操作失败'),
  });

  if (!tenantReady) {
    return (
      <div className="page-loading">
        <Spin tip="加载公司上下文…" />
      </div>
    );
  }

  return (
    <div className="page marketplace-hire-page">
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        商城 Agent 招聘
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        从商城选择岗位模板并提交申请；公司 Owner/Admin 审批通过后自动安装。直接购买已关闭，仅平台管理员可用直购接口。
      </Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="请选择未绑定 Agent 的组织节点（agent 类型空位）后再发起申请。"
      />

      <Card title="商城目录" style={{ marginBottom: 16 }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="搜索名称 / 描述 / 专长"
            allowClear
            style={{ width: 280 }}
            onSearch={setSearch}
          />
          <Input
            placeholder="技能标签（逗号分隔，任意命中）"
            allowClear
            style={{ width: 260 }}
            value={skillTags}
            onChange={(e) => setSkillTags(e.target.value)}
          />
          <Button
            type="primary"
            onClick={() => catalogQ.refetch()}
            loading={catalogQ.isFetching}
          >
            刷新
          </Button>
        </Space>
        <Table
          size="small"
          rowKey="id"
          loading={catalogQ.isLoading}
          dataSource={catalogQ.data?.items ?? []}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name', key: 'name' },
            { title: '专长', dataIndex: 'expertise', key: 'expertise', ellipsis: true },
            {
              title: '操作',
              key: 'act',
              width: 120,
              render: (_: unknown, r: { id: string; name: string }) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    form.setFieldsValue({
                      marketplaceAgentId: r.id,
                      organizationNodeId: emptySlots[0]?.id,
                    });
                    setApplyOpen(true);
                  }}
                >
                  申请招聘
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title="招聘申请"
        extra={
          <Button type="primary" onClick={() => setApplyOpen(true)}>
            新建申请
          </Button>
        }
      >
        <Table
          size="small"
          rowKey="id"
          loading={hiresQ.isLoading}
          dataSource={hiresQ.data?.items ?? []}
          pagination={false}
          columns={[
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (s: string) => {
                const t = STATUS_TAG[s] ?? { color: 'default', label: s };
                return <Tag color={t.color}>{t.label}</Tag>;
              },
            },
            { title: '商品 ID', dataIndex: 'marketplaceAgentId', ellipsis: true },
            { title: '组织节点', dataIndex: 'organizationNodeId', ellipsis: true },
            { title: '说明', dataIndex: 'requestedReason', ellipsis: true },
            {
              title: '提示',
              key: 'hint',
              ellipsis: true,
              render: (_: unknown, r: MarketplaceHireRequest) =>
                r.errorMessage ? (
                  <Typography.Text type="warning">{r.errorMessage}</Typography.Text>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              title: '操作',
              key: 'ops',
              width: 220,
              render: (_: unknown, row: MarketplaceHireRequest) =>
                row.status === 'pending' ? (
                  <Space>
                    <Button
                      size="small"
                      type="primary"
                      loading={approveMut.isPending}
                      onClick={() => approveMut.mutate(row.id)}
                    >
                      通过
                    </Button>
                    <Button
                      size="small"
                      danger
                      loading={rejectMut.isPending}
                      onClick={() => {
                        setRejectRow(row);
                        setRejectReasonInput('');
                      }}
                    >
                      驳回
                    </Button>
                  </Space>
                ) : row.status === 'approved' ? (
                  <Button
                    size="small"
                    danger
                    loading={rejectMut.isPending}
                    onClick={() => {
                      setRejectRow(row);
                      setRejectReasonInput('');
                    }}
                  >
                    取消安装
                  </Button>
                ) : (
                  <span className="muted">—</span>
                ),
            },
          ]}
        />
      </Card>

      <Modal
        title={
          rejectRow?.status === 'approved' ? '取消处理中的安装' : '驳回招聘申请'
        }
        open={!!rejectRow}
        onCancel={() => setRejectRow(null)}
        okText={rejectRow?.status === 'approved' ? '确认取消' : '确认驳回'}
        okButtonProps={{ danger: true, loading: rejectMut.isPending }}
        onOk={async () => {
          if (!rejectRow) return;
          await rejectMut.mutateAsync({
            id: rejectRow.id,
            reason: rejectReasonInput.trim() || undefined,
            cancelStalled: rejectRow.status === 'approved',
          });
          setRejectRow(null);
        }}
        destroyOnClose
      >
        <Input.TextArea
          rows={3}
          placeholder="可选：驳回原因"
          value={rejectReasonInput}
          onChange={(e) => setRejectReasonInput(e.target.value)}
        />
      </Modal>

      <Modal
        title="发起商城招聘申请"
        open={applyOpen}
        onCancel={() => setApplyOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => createMut.mutate(v)}
          initialValues={{}}
        >
          <Form.Item
            name="marketplaceAgentId"
            label="商城商品 ID"
            rules={[{ required: true, message: '请填写或从目录选择' }]}
          >
            <Input placeholder="UUID" />
          </Form.Item>
          <Form.Item
            name="organizationNodeId"
            label="目标组织节点（须空位）"
            rules={[{ required: true, message: '请选择节点' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={treeQ.isLoading ? '加载组织树…' : '选择 agent 空位'}
              loading={treeQ.isLoading}
              options={emptySlots.map((n) => ({
                value: n.id,
                label: `${n.name} (${n.id.slice(0, 8)}…)`,
              }))}
            />
          </Form.Item>
          <Form.Item name="requestedReason" label="申请说明">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={createMut.isPending} block>
              提交申请
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
