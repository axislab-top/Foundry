import type { MouseEvent, ReactElement } from 'react';
import {
  AppstoreOutlined,
  AuditOutlined,
  ControlOutlined,
  CrownOutlined,
  DashboardOutlined,
  KeyOutlined,
  RobotOutlined,
  TeamOutlined,
  UserOutlined,
  ToolOutlined,
  ApartmentOutlined,
  WalletOutlined
} from '@ant-design/icons';
import { Breadcrumb, Button, Layout, Menu, Space, theme, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { buildBreadcrumbItems, navOpenKeys, NAV_PARENT_KEYS } from '../navigation';
import { useAuth } from '../providers/AuthProvider';

const navItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '总览' },
  {
    key: NAV_PARENT_KEYS.governance,
    icon: <ControlOutlined />,
    label: '运行治理',
    children: [
      { key: '/rollout/phase3', label: 'Phase 3 灰度参考' },
      {
        key: '/agent-ecosystem/collaboration-main-chain',
        icon: <ApartmentOutlined />,
        label: '协作主链开关'
      }
    ]
  },
  { key: '/audit-logs', icon: <AuditOutlined />, label: '网关请求审计' },
  {
    key: NAV_PARENT_KEYS.identity,
    icon: <UserOutlined />,
    label: '用户与身份',
    children: [{ key: '/users/platform', label: '平台用户' }]
  },
  { key: '/platform-departments', icon: <TeamOutlined />, label: '平台部门' },
  {
    key: NAV_PARENT_KEYS.billing,
    icon: <WalletOutlined />,
    label: '计费与 Credit',
    children: [
      { key: '/billing/activities', label: '平台活动' },
      { key: '/billing/recharge-orders', label: '购额订单' },
    ]
  },
  {
    key: '/agent-ecosystem',
    icon: <RobotOutlined />,
    label: 'Agent 生态',
    children: [
      {
        key: '/agent-ecosystem/marketplace',
        icon: <AppstoreOutlined />,
        label: '模板市场',
        children: [
          {
            key: '/agent-ecosystem/marketplace/ceo',
            icon: <CrownOutlined />,
            label: 'CEO'
          },
          {
            key: '/agent-ecosystem/marketplace/department-head',
            icon: <TeamOutlined />,
            label: '部门主管'
          },
          {
            key: '/agent-ecosystem/marketplace/employee',
            icon: <UserOutlined />,
            label: '员工'
          }
        ]
      },
      {
        key: '/agent-ecosystem/platform-models-keys',
        icon: <KeyOutlined />,
        label: '平台模型与密钥'
      },
      {
        key: '/agent-ecosystem/skills-tools-mcp',
        icon: <ToolOutlined />,
        label: '技能与工具',
        children: [
          { key: '/agent-ecosystem/skills-tools-mcp/skills', label: 'Skills' },
          { key: '/agent-ecosystem/skills-tools-mcp/tools', label: 'Tools' },
          { key: '/agent-ecosystem/skills-tools-mcp/mcptools', label: 'MCP Tools' }
        ]
      }
    ]
  }
];

type NavItem = {
  key: string;
  label: string;
  icon?: ReactElement;
  children?: NavItem[];
};

const allNavKeys = (navItems as NavItem[]).flatMap((item) => [
  item.key,
  ...(item.children?.flatMap((child) => [
    child.key,
    ...(child.children?.map((grandChild) => grandChild.key) ?? []),
  ]) ?? []),
]);

const ROUTE_NAV_KEYS = new Set(
  allNavKeys.filter((key) => key.startsWith('/'))
);

export function RootLayout(): ReactElement {
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  const path = location.pathname === '/' ? '/dashboard' : location.pathname;
  const selectedKey =
    [...allNavKeys]
      .filter((key) => key.startsWith('/'))
      .sort((a, b) => b.length - a.length)
      .find((key) => path === key || path.startsWith(`${key}/`)) ?? '/dashboard';

  const breadcrumbItems = buildBreadcrumbItems(path).map((item) =>
    item.path
      ? {
          title: item.title,
          href: item.path,
          onClick: (event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            navigate(item.path!);
          }
        }
      : { title: item.title }
  );

  const handleMenuClick = ({ key }: { key: string }): void => {
    if (!ROUTE_NAV_KEYS.has(key)) return;
    navigate(key);
  };

  return (
    <Layout className="erp-ant-layout">
      <Layout.Sider width={240} className="erp-ant-sider">
        <div className="erp-ant-brand">Foundry 管理后台</div>
        <Menu
          theme="light"
          mode="inline"
          className="erp-ant-menu"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={navOpenKeys(path)}
          items={navItems}
          onClick={handleMenuClick}
        />
      </Layout.Sider>
      <Layout className="erp-ant-main">
        <Layout.Header className="erp-ant-header">
          <div className="erp-ant-header-row">
            <Breadcrumb items={breadcrumbItems.length ? breadcrumbItems : [{ title: '总览' }]} />
            <Space size={12}>
              <Typography.Text type="secondary">{currentUser?.username}</Typography.Text>
              <Button
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
              >
                退出登录
              </Button>
            </Space>
          </div>
        </Layout.Header>
        <Layout.Content className="erp-ant-content">
          <div
            className="erp-ant-content-card"
            style={{ background: token.colorBgContainer, borderRadius: token.borderRadiusLG }}
          >
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
