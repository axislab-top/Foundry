import { useMemo, type ReactElement } from 'react';
import { Button, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { formatCredit, formatRmbFromCredit, rmbFromCredit } from '../../constants';
import type { CompanyOption, RechargeOrder, RechargeOrderStatus } from '../../types';

export type RechargeOrderRow = RechargeOrder & { key: string; companyName: string };

function formatTime(value: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

function statusTag(status: RechargeOrderStatus): ReactElement {
  switch (status) {
    case 'pending':
      return <Tag color="processing">待审批</Tag>;
    case 'approved':
      return <Tag color="success">已入账</Tag>;
    case 'rejected':
      return <Tag color="error">已拒绝</Tag>;
    case 'cancelled':
      return <Tag>已取消</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

type Props = {
  rows: RechargeOrderRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onTableChange: (pagination: TablePaginationConfig) => void;
  onApprove: (row: RechargeOrderRow) => void;
  onReject: (row: RechargeOrderRow) => void;
  actionLoadingId?: string | null;
};

export function RechargeOrderTable({
  rows,
  loading,
  page,
  pageSize,
  total,
  onTableChange,
  onApprove,
  onReject,
  actionLoadingId,
}: Props): ReactElement {
  const columns: ColumnsType<RechargeOrderRow> = useMemo(
    () => [
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 172,
        render: (v: string) => formatTime(v),
      },
      {
        title: '订单 ID',
        dataIndex: 'id',
        key: 'id',
        width: 120,
        render: (id: string) => (
          <Tooltip title={id}>
            <Typography.Text copyable={{ text: id }}>{shortId(id)}</Typography.Text>
          </Tooltip>
        ),
      },
      {
        title: '公司',
        dataIndex: 'companyName',
        key: 'companyName',
        width: 120,
        ellipsis: true,
      },
      {
        title: 'Credit',
        dataIndex: 'amount',
        key: 'amount',
        width: 130,
        render: (amount: string) => formatCredit(parseFloat(amount)),
      },
      {
        title: '约合 ¥',
        key: 'rmb',
        width: 100,
        render: (_v, row) => formatRmbFromCredit(parseFloat(row.amount)),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 96,
        render: (s: RechargeOrderStatus) => statusTag(s),
      },
      {
        title: '申请人',
        dataIndex: 'requestedByUserId',
        key: 'requestedByUserId',
        width: 120,
        ellipsis: true,
        render: (id: string) => (
          <Tooltip title={id}>
            <Link to={`/users/platform?userId=${encodeURIComponent(id)}`}>{shortId(id)}</Link>
          </Tooltip>
        ),
      },
      {
        title: '确认人',
        key: 'reviewed',
        width: 120,
        render: (_v, row) => {
          if (!row.reviewedByUserId) return '—';
          const isSelfConfirm =
            row.status === 'approved' && row.reviewedByUserId === row.requestedByUserId;
          const label = shortId(row.reviewedByUserId);
          if (isSelfConfirm) {
            return (
              <Tooltip title={`系统自动确认 · ${row.reviewedAt ?? ''}`}>
                <span>{label}</span>
              </Tooltip>
            );
          }
          return (
            <span title={row.reviewedAt ?? ''}>{label}</span>
          );
        },
      },
      {
        title: '备注',
        dataIndex: 'applyNote',
        key: 'applyNote',
        ellipsis: true,
        render: (v: string | null) => v ?? '—',
      },
      {
        title: '拒绝原因',
        dataIndex: 'rejectReason',
        key: 'rejectReason',
        ellipsis: true,
        render: (v: string | null) => v ?? '—',
      },
      {
        title: '操作',
        key: 'actions',
        width: 140,
        fixed: 'right',
        render: (_v, row) =>
          row.status === 'pending' ? (
            <Space size="small">
              <Button
                type="link"
                size="small"
                loading={actionLoadingId === row.id}
                onClick={() => onApprove(row)}
              >
                通过
              </Button>
              <Button type="link" size="small" danger onClick={() => onReject(row)}>
                拒绝
              </Button>
            </Space>
          ) : (
            '—'
          ),
      },
    ],
    [actionLoadingId, onApprove, onReject],
  );

  return (
    <Table
      columns={columns}
      dataSource={rows}
      loading={loading}
      size="middle"
      scroll={{ x: 1200 }}
      onChange={onTableChange}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50],
        showTotal: (t) => `共 ${t} 条`,
      }}
    />
  );
}

export function buildOrderRows(
  items: RechargeOrder[],
  companies: CompanyOption[],
): RechargeOrderRow[] {
  const nameById = new Map(companies.map((c) => [c.id, c.name]));
  return items.map((item) => ({
    ...item,
    key: item.id,
    companyName: item.companyName ?? nameById.get(item.companyId) ?? item.companyId.slice(0, 8),
  }));
}

export function exportRechargeOrdersCsv(rows: RechargeOrderRow[]): void {
  const header = [
    'createdAt',
    'companyId',
    'companyName',
    'orderId',
    'credit',
    'rmb',
    'status',
    'requestedBy',
    'reviewedBy',
    'applyNote',
    'rejectReason',
  ];
  const lines = rows.map((row) => {
    const credit = parseFloat(row.amount);
    const rmb = rmbFromCredit(credit).toFixed(2);
    return [
      formatTime(row.createdAt),
      row.companyId,
      row.companyName,
      row.id,
      row.amount,
      rmb,
      row.status,
      row.requestedByUserId,
      row.reviewedByUserId ?? '',
      row.applyNote ?? '',
      row.rejectReason ?? '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',');
  });
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `recharge-orders-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
