import type { ReactElement } from 'react';
import { Alert, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import type { UserAdminContextStats, UserRechargeOrderSummary } from '../types';

function formatTime(value: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

function statusTag(status: string): ReactElement {
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

type UserBillingPanelProps = {
  orders: UserRechargeOrderSummary[];
  stats: UserAdminContextStats;
  userId: string;
};

export function UserBillingPanel({ orders, stats, userId }: UserBillingPanelProps): ReactElement {
  const columns: ColumnsType<UserRechargeOrderSummary> = [
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 172,
      render: (value: string) => formatTime(value),
    },
    {
      title: '企业',
      dataIndex: 'companyName',
      key: 'companyName',
      render: (name: string | null, row) =>
        name ? (
          <Link to={`/billing/recharge-orders?companyId=${encodeURIComponent(row.companyId)}`}>
            {name}
          </Link>
        ) : (
          <Typography.Text type="secondary">{row.companyId.slice(0, 8)}…</Typography.Text>
        ),
    },
    {
      title: 'Credit',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (amount: string, row) => `${amount} ${row.currency}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      render: (status: string) => statusTag(status),
    },
    {
      title: '备注',
      dataIndex: 'applyNote',
      key: 'applyNote',
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '订单 ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (id: string) => (
        <Typography.Text copyable={{ text: id }}>{`${id.slice(0, 8)}…`}</Typography.Text>
      ),
    },
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={`共 ${stats.rechargeOrderCount} 笔购额申请，已入账合计 ${stats.approvedCreditTotal} Credit。`}
      />
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={orders}
        pagination={orders.length > 10 ? { pageSize: 10 } : false}
        locale={{ emptyText: '暂无购额记录' }}
        scroll={{ x: 900 }}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        <Link to={`/billing/recharge-orders?requestedByUserId=${encodeURIComponent(userId)}`}>
          在购额订单管理中查看该用户全部订单
        </Link>
      </Typography.Paragraph>
    </>
  );
}
