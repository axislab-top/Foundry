import type { ReactElement } from 'react';
import { Button, Popconfirm, Space, Switch, Table, Tag } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import type { PlatformUserRow } from '../types';

function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

type UserTableProps = {
  rows: PlatformUserRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  onTableChange: (pagination: TablePaginationConfig, sorter: { field?: string; order?: string }) => void;
  onView: (row: PlatformUserRow) => void;
  onEdit: (row: PlatformUserRow) => void;
  onToggleEnabled: (row: PlatformUserRow, enabled: boolean) => void;
  onDelete: (row: PlatformUserRow) => void;
  actionLoadingId: string | null;
};

export function UserTable({
  rows,
  loading,
  page,
  pageSize,
  total,
  sortBy,
  sortOrder,
  onTableChange,
  onView,
  onEdit,
  onToggleEnabled,
  onDelete,
  actionLoadingId,
}: UserTableProps): ReactElement {
  const columns: ColumnsType<PlatformUserRow> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      sorter: true,
      sortOrder: sortBy === 'username' ? (sortOrder === 'ASC' ? 'ascend' : 'descend') : undefined,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
    },
    {
      title: '创建企业',
      key: 'ownedCompanies',
      width: 88,
      align: 'center',
      render: (_, row) => row.stats?.ownedCompanyCount ?? '—',
    },
    {
      title: '成员企业',
      key: 'memberCompanies',
      width: 88,
      align: 'center',
      render: (_, row) => row.stats?.memberCompanyCount ?? '—',
    },
    {
      title: '购额',
      key: 'rechargeOrders',
      width: 72,
      align: 'center',
      render: (_, row) => row.stats?.rechargeOrderCount ?? '—',
    },
    {
      title: '状态',
      key: 'enabled',
      width: 100,
      render: (_, row) =>
        row.enabled ? <Tag color="success">正常</Tag> : <Tag color="default">已禁用</Tag>,
    },
    {
      title: '删除',
      key: 'deleted',
      width: 100,
      render: (_, row) =>
        row.deletedAt ? <Tag color="error">已删除</Tag> : <Tag>正常</Tag>,
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 180,
      sorter: true,
      sortOrder: sortBy === 'lastLoginAt' ? (sortOrder === 'ASC' ? 'ascend' : 'descend') : undefined,
      render: (value: string | null) => formatTime(value),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      sorter: true,
      defaultSortOrder: 'descend',
      sortOrder: sortBy === 'createdAt' ? (sortOrder === 'ASC' ? 'ascend' : 'descend') : undefined,
      render: (value: string) => formatTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, row) => {
        const isDeleted = !!row.deletedAt;
        const busy = actionLoadingId === row.id;

        return (
          <Space size={4} wrap>
            <Button type="link" size="small" onClick={() => onView(row)}>
              详情
            </Button>
            <Button type="link" size="small" disabled={isDeleted} onClick={() => onEdit(row)}>
              编辑
            </Button>
            <Switch
              size="small"
              checked={row.enabled}
              disabled={isDeleted || busy}
              loading={busy}
              checkedChildren="启"
              unCheckedChildren="禁"
              onChange={(checked) => onToggleEnabled(row, checked)}
            />
            <Popconfirm
              title="确认软删除该用户？"
              description="删除后可在「已删除」筛选中查看；暂不支持恢复。"
              okText="删除"
              cancelText="取消"
              disabled={isDeleted}
              onConfirm={() => onDelete(row)}
            >
              <Button type="link" size="small" danger disabled={isDeleted}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Table<PlatformUserRow>
      rowKey="id"
      columns={columns}
      dataSource={rows}
      loading={loading}
      scroll={{ x: 960 }}
      locale={{ emptyText: '暂无用户，可点击「新建用户」创建' }}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (t) => `共 ${t} 条`,
      }}
      onChange={(pagination, _filters, sorter) => {
        const s = Array.isArray(sorter) ? sorter[0] : sorter;
        onTableChange(pagination, {
          field: s?.field != null ? String(s.field) : undefined,
          order: s?.order ?? undefined,
        });
      }}
    />
  );
}

export function exportPlatformUsersCsv(rows: PlatformUserRow[]): void {
  const header = [
    'id',
    'username',
    'email',
    'ownedCompanyCount',
    'memberCompanyCount',
    'rechargeOrderCount',
    'enabled',
    'deleted',
    'lastLoginAt',
    'createdAt',
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.username,
      row.email,
      row.stats?.ownedCompanyCount ?? '',
      row.stats?.memberCompanyCount ?? '',
      row.stats?.rechargeOrderCount ?? '',
      row.enabled ? 'true' : 'false',
      row.deletedAt ? 'true' : 'false',
      row.lastLoginAt ?? '',
      row.createdAt,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(','),
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `platform-users-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
