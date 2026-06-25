import { useEffect, useState, type ReactElement } from 'react';
import {
  Badge,
  Button,
  Descriptions,
  Drawer,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { getUserAdminContext } from '../api';
import type { UserAdminContext } from '../types';
import { UserBillingPanel } from './UserBillingPanel';
import { UserCompaniesPanel } from './UserCompaniesPanel';
import { UserOAuthPanel } from './UserOAuthPanel';
import { UserOverviewPanel } from './UserOverviewPanel';

const { Paragraph } = Typography;

type UserDetailDrawerProps = {
  open: boolean;
  userId: string | null;
  onClose: () => void;
};

export function UserDetailDrawer({ open, userId, onClose }: UserDetailDrawerProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<UserAdminContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const load = async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserAdminContext(id);
      setContext(data);
    } catch (e: unknown) {
      setContext(null);
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !userId) {
      setContext(null);
      setError(null);
      setActiveTab('overview');
      return;
    }
    void load(userId);
  }, [open, userId]);

  const copyId = async (): Promise<void> => {
    if (!context?.user.id) return;
    try {
      await navigator.clipboard.writeText(context.user.id);
      message.success('已复制用户 ID');
    } catch {
      message.error('复制失败');
    }
  };

  const user = context?.user;
  const stats = context?.stats;

  const tabItems =
    user && stats
      ? [
          {
            key: 'overview',
            label: '概览',
            children: <UserOverviewPanel user={user} />,
          },
          {
            key: 'companies',
            label: (
              <Badge
                count={stats.ownedCompanyCount + stats.memberCompanyCount}
                size="small"
                offset={[6, 0]}
              >
                企业与 Credit
              </Badge>
            ),
            children: (
              <UserCompaniesPanel
                ownedCompanies={context.ownedCompanies}
                memberCompanies={context.memberCompanies}
              />
            ),
          },
          {
            key: 'billing',
            label: (
              <Badge count={stats.rechargeOrderCount} size="small" offset={[6, 0]}>
                购额记录
              </Badge>
            ),
            children: (
              <UserBillingPanel
                orders={context.rechargeOrders}
                stats={stats}
                userId={user.id}
              />
            ),
          },
          {
            key: 'oauth',
            label: (
              <Badge count={context.oauthAccounts.length} size="small" offset={[6, 0]}>
                第三方绑定
              </Badge>
            ),
            children: <UserOAuthPanel accounts={context.oauthAccounts} />,
          },
        ]
      : [];

  return (
    <Drawer
      title={user ? `用户详情 · ${user.username}` : '用户详情'}
      open={open}
      size={800}
      destroyOnHidden
      onClose={onClose}
      extra={
        user ? (
          <Space>
            <Button
              icon={<ReloadOutlined />}
              size="small"
              loading={loading}
              onClick={() => userId && void load(userId)}
            >
              刷新
            </Button>
            <Button icon={<CopyOutlined />} size="small" onClick={() => void copyId()}>
              复制 ID
            </Button>
          </Space>
        ) : null
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : error ? (
        <Paragraph type="danger">{error}</Paragraph>
      ) : user && stats ? (
        <>
          <Descriptions size="small" column={4} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="创建企业">{stats.ownedCompanyCount}</Descriptions.Item>
            <Descriptions.Item label="成员企业">{stats.memberCompanyCount}</Descriptions.Item>
            <Descriptions.Item label="购额订单">{stats.rechargeOrderCount}</Descriptions.Item>
            <Descriptions.Item label="已入账">
              <Tag color="success">{stats.approvedCreditTotal} Credit</Tag>
            </Descriptions.Item>
          </Descriptions>
          <Tabs activeKey={activeTab} items={tabItems} onChange={setActiveTab} />
        </>
      ) : null}
    </Drawer>
  );
}
