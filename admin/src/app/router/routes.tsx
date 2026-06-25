import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate } from 'react-router-dom';

type AppRoute = {
  path: string;
  label: string;
  component: ComponentType | LazyExoticComponent<ComponentType>;
};

const DashboardPage = lazy(() => import('../../features/dashboard/page'));
const Phase3RolloutPage = lazy(() => import('../../features/phase3-rollout/page'));
const CollaborationMainChainPage = lazy(() => import('../../features/collaboration-main-chain/page'));
const AuditLogsPage = lazy(() => import('../../features/audit-logs/page'));
const PlatformDepartmentsPage = lazy(() => import('../../features/platform-departments/page'));
const AgentMarketplaceRedirect = () => <Navigate to="/agent-ecosystem/marketplace/ceo" replace />;
const AgentMarketplaceCeoPage = lazy(
  () => import('../../features/agent-ecosystem/marketplace/ceo-page')
);
const AgentMarketplaceDepartmentHeadPage = lazy(
  () => import('../../features/agent-ecosystem/marketplace/department-head-page')
);
const AgentMarketplaceEmployeePage = lazy(
  () => import('../../features/agent-ecosystem/marketplace/employee-page')
);
const AgentMarketplaceDetailPage = lazy(
  () => import('../../features/agent-ecosystem/marketplace/detail-page')
);
const PlatformModelsKeysPage = lazy(
  () => import('../../features/agent-ecosystem/platform-models-keys/page')
);
const SkillsToolsMcpRedirect = () =>
  <Navigate to="/agent-ecosystem/skills-tools-mcp/skills" replace />;
const SkillsPage = lazy(() => import('../../features/agent-ecosystem/skills-tools-mcp/skills/page'));
const ToolsPage = lazy(() => import('../../features/agent-ecosystem/skills-tools-mcp/tools/page'));
const McpToolsPage = lazy(
  () => import('../../features/agent-ecosystem/skills-tools-mcp/mcptools/page')
);
const BillingActivitiesPage = lazy(
  () => import('../../features/billing/activities/page')
);
const BillingRechargeOrdersPage = lazy(
  () => import('../../features/billing/recharge-orders/page')
);
const PlatformUsersPage = lazy(() => import('../../features/platform-users/page'));
const RootRedirect = () => <Navigate to="/dashboard" replace />;

export const routes: AppRoute[] = [
  { path: '/', label: 'Dashboard', component: RootRedirect },
  { path: '/dashboard', label: 'Dashboard', component: DashboardPage },
  { path: '/rollout/phase3', label: 'Phase 3 Rollout', component: Phase3RolloutPage },
  {
    path: '/agent-ecosystem/collaboration-main-chain',
    label: 'Collaboration Main Chain',
    component: CollaborationMainChainPage,
  },
  { path: '/audit-logs', label: 'Audit Logs', component: AuditLogsPage },
  { path: '/platform-departments', label: 'Platform Departments', component: PlatformDepartmentsPage },
  { path: '/users/platform', label: 'Platform Users', component: PlatformUsersPage },
  {
    path: '/billing/activities',
    label: 'Billing Activities',
    component: BillingActivitiesPage,
  },
  {
    path: '/billing/recharge-orders',
    label: 'Billing Recharge Orders',
    component: BillingRechargeOrdersPage
  },
  {
    path: '/agent-ecosystem/marketplace',
    label: 'Agent Marketplace',
    component: AgentMarketplaceRedirect
  },
  {
    path: '/agent-ecosystem/marketplace/ceo',
    label: 'Agent Marketplace CEO',
    component: AgentMarketplaceCeoPage
  },
  {
    path: '/agent-ecosystem/marketplace/department-head',
    label: 'Agent Marketplace Department Head',
    component: AgentMarketplaceDepartmentHeadPage
  },
  {
    path: '/agent-ecosystem/marketplace/department-head/:agentId',
    label: 'Department Head Detail',
    component: AgentMarketplaceDetailPage
  },
  {
    path: '/agent-ecosystem/marketplace/employee',
    label: 'Agent Marketplace Employee',
    component: AgentMarketplaceEmployeePage
  },
  {
    path: '/agent-ecosystem/marketplace/:agentId',
    label: 'Agent Detail',
    component: AgentMarketplaceDetailPage
  },
  {
    path: '/agent-ecosystem/platform-models-keys',
    label: 'Platform Models & Keys',
    component: PlatformModelsKeysPage
  },
  {
    path: '/agent-ecosystem/skills-tools-mcp',
    label: 'Skills + Tools / MCP Tools',
    component: SkillsToolsMcpRedirect
  },
  {
    path: '/agent-ecosystem/skills-tools-mcp/skills',
    label: 'Skills',
    component: SkillsPage
  },
  {
    path: '/agent-ecosystem/skills-tools-mcp/tools',
    label: 'Tools',
    component: ToolsPage
  },
  {
    path: '/agent-ecosystem/skills-tools-mcp/mcptools',
    label: 'MCP Tools',
    component: McpToolsPage
  }
];
