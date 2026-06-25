import type { ReactElement } from 'react';
import { Alert, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import type { UserCompanyContextItem } from '../types';

const { Text } = Typography;

const ROLE_LABELS: Record<string, string> = {
  owner: '所有者',
  admin: '管理员',
  supervisor: '主管',
  member: '成员',
};

function formatTime(value: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

function statusTag(status: string, isActive: boolean): ReactElement {
  if (!isActive) return <Tag>未激活</Tag>;
  switch (status) {
    case 'active':
      return <Tag color="success">运营中</Tag>;
    case 'suspended':
      return <Tag color="warning">已暂停</Tag>;
    case 'archived':
      return <Tag color="default">已归档</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

function formatCredit(total: string | null, used: string | null, currency: string | null): string {
  if (total == null) return '—';
  const cur = currency ?? 'CREDIT';
  if (used != null) return `${used} / ${total} ${cur}`;
  return `${total} ${cur}`;
}

function buildColumns(showRole: boolean): ColumnsType<UserCompanyContextItem> {
  const cols: ColumnsType<UserCompanyContextItem> = [
    {
      title: '企业名称',
      dataIndex: 'companyName',
      key: 'companyName',
      render: (name: string, row) => (
        <Link to={`/billing/recharge-orders?companyId=${encodeURIComponent(row.companyId)}`}>
          {name}
        </Link>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, row) => statusTag(row.companyStatus, row.isActive),
    },
  ];

  if (showRole) {
    cols.push({
      title: '成员角色',
      key: 'membershipRole',
      width: 96,
      render: (_, row) =>
        row.membershipRole ? (
          <Tag>{ROLE_LABELS[row.membershipRole] ?? row.membershipRole}</Tag>
        ) : (
          '—'
        ),
    });
  }

  cols.push(
    {
      title: 'Credit 余额',
      key: 'credit',
      width: 160,
      render: (_, row) => formatCredit(row.creditTotal, row.creditUsed, row.creditCurrency),
    },
    {
      title: showRole ? '加入时间' : '创建时间',
      key: 'time',
      width: 172,
      render: (_, row) => formatTime(showRole ? (row.joinedAt ?? row.createdAt) : row.createdAt),
    },
    {
      title: '企业 ID',
      dataIndex: 'companyId',
      key: 'companyId',
      width: 120,
      render: (id: string) => <Text copyable={{ text: id }}>{`${id.slice(0, 8)}…`}</Text>,
    },
  );

  return cols;
}

type UserCompaniesPanelProps = {
  ownedCompanies: UserCompanyContextItem[];
  memberCompanies: UserCompanyContextItem[];
};

export function UserCompaniesPanel({
  ownedCompanies,
  memberCompanies,
}: UserCompaniesPanelProps): ReactElement {
  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        创建的企业（{ownedCompanies.length}）
      </Typography.Title>
      <Table
        rowKey="companyId"
        size="small"
        columns={buildColumns(false)}
        dataSource={ownedCompanies}
        pagination={ownedCompanies.length > 5 ? { pageSize: 5 } : false}
        locale={{ emptyText: '该用户尚未创建企业' }}
        scroll={{ x: 800 }}
        style={{ marginBottom: 24 }}
      />

      <Typography.Title level={5}>成员身份企业（{memberCompanies.length}）</Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="成员企业包含用户通过邀请加入的工作区；创建人可能为其他用户。"
      />
      <Table
        rowKey={(row) => row.membershipId ?? row.companyId}
        size="small"
        columns={buildColumns(true)}
        dataSource={memberCompanies}
        pagination={memberCompanies.length > 5 ? { pageSize: 5 } : false}
        locale={{ emptyText: '暂无成员身份企业' }}
        scroll={{ x: 880 }}
      />
    </>
  );
}
