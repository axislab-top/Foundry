import type { ReactElement } from 'react';
import { Descriptions, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { PlatformUser } from '../types';

const { Text, Paragraph } = Typography;

function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

type UserOverviewPanelProps = {
  user: PlatformUser;
};

export function UserOverviewPanel({ user }: UserOverviewPanelProps): ReactElement {
  return (
    <>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="用户 ID">
          <Text code copyable={{ text: user.id }}>
            {user.id}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
        <Descriptions.Item label="邮箱">{user.email}</Descriptions.Item>
        <Descriptions.Item label="账号状态">
          {user.enabled ? <Tag color="success">正常</Tag> : <Tag>已禁用</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="删除状态">
          {user.deletedAt ? <Tag color="error">已删除</Tag> : <Tag>正常</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="最近登录">{formatTime(user.lastLoginAt)}</Descriptions.Item>
        <Descriptions.Item label="注册时间">{formatTime(user.createdAt)}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{formatTime(user.updatedAt)}</Descriptions.Item>
        {user.deletedAt ? (
          <Descriptions.Item label="删除时间">{formatTime(user.deletedAt)}</Descriptions.Item>
        ) : null}
      </Descriptions>
      <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
        密码重置需用户通过主客户端「忘记密码」自助完成；Credit 余额归属企业而非个人账号。
      </Paragraph>
    </>
  );
}
