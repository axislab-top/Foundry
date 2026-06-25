import type { ReactElement } from 'react';
import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { UserOAuthAccount } from '../types';

function formatTime(value: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

const PROVIDER_LABELS: Record<string, string> = {
  wechat: '微信',
  github: 'GitHub',
  google: 'Google',
};

type UserOAuthPanelProps = {
  accounts: UserOAuthAccount[];
};

export function UserOAuthPanel({ accounts }: UserOAuthPanelProps): ReactElement {
  const columns: ColumnsType<UserOAuthAccount> = [
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      width: 100,
      render: (provider: string) => PROVIDER_LABELS[provider] ?? provider,
    },
    {
      title: '第三方用户名',
      dataIndex: 'providerUsername',
      key: 'providerUsername',
      render: (name: string | null) => name ?? '—',
    },
    {
      title: '第三方 ID',
      dataIndex: 'providerUserId',
      key: 'providerUserId',
      ellipsis: true,
    },
    {
      title: '绑定时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 172,
      render: (value: string) => formatTime(value),
    },
  ];

  return (
    <Table
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={accounts}
      pagination={false}
      locale={{ emptyText: '暂无第三方账号绑定' }}
    />
  );
}
