/** 侧栏与面包屑文案（运营界面统一中文） */
export const ROUTE_LABELS: Record<string, string> = {
  dashboard: '总览',
  'audit-logs': '网关请求审计',
  'platform-departments': '平台部门',
  'agent-ecosystem': 'Agent 生态',
  marketplace: '模板市场',
  ceo: 'CEO 模板',
  'department-head': '部门主管模板',
  employee: '员工模板',
  'collaboration-main-chain': '协作主链开关',
  'platform-models-keys': '平台模型与密钥',
  'skills-tools-mcp': '技能与工具',
  skills: 'Skills',
  tools: 'Tools',
  mcptools: 'MCP Tools',
  rollout: '运行治理',
  phase3: 'Phase 3 灰度参考',
  billing: '计费与 Credit',
  activities: '平台活动',
  'recharge-orders': '购额订单',
  users: '用户与身份',
  platform: '平台用户',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function breadcrumbTitle(segment: string): string {
  if (UUID_RE.test(segment)) return '模板详情';
  return ROUTE_LABELS[segment] ?? segment.split('-').map((w) => `${w[0]?.toUpperCase() ?? ''}${w.slice(1)}`).join(' ');
}

/** 面包屑可跳转的路径（与 router/routes.tsx 静态路由一致；不含仅作 redirect 的中间路径） */
const NAVIGABLE_BREADCRUMB_PATHS = new Set([
  '/dashboard',
  '/rollout/phase3',
  '/agent-ecosystem/collaboration-main-chain',
  '/audit-logs',
  '/platform-departments',
  '/users/platform',
  '/billing/activities',
  '/billing/recharge-orders',
  '/agent-ecosystem/marketplace/ceo',
  '/agent-ecosystem/marketplace/department-head',
  '/agent-ecosystem/marketplace/employee',
  '/agent-ecosystem/platform-models-keys',
  '/agent-ecosystem/skills-tools-mcp/skills',
  '/agent-ecosystem/skills-tools-mcp/tools',
  '/agent-ecosystem/skills-tools-mcp/mcptools',
]);

const MARKETPLACE_SECTIONS = new Set(['ceo', 'department-head', 'employee']);
const SKILLS_TOOLS_SECTIONS = new Set(['skills', 'tools', 'mcptools']);

function marketplaceListPath(segments: string[]): string | null {
  const marketplaceIndex = segments.indexOf('marketplace');
  if (marketplaceIndex === -1) return null;

  const section = segments[marketplaceIndex + 1];
  if (section && MARKETPLACE_SECTIONS.has(section)) {
    return `/agent-ecosystem/marketplace/${section}`;
  }
  // /agent-ecosystem/marketplace/:agentId 为员工模板详情
  if (section && UUID_RE.test(section)) {
    return '/agent-ecosystem/marketplace/employee';
  }
  return null;
}

function skillsToolsListPath(segments: string[]): string | null {
  const sectionIndex = segments.indexOf('skills-tools-mcp');
  if (sectionIndex === -1) return null;

  const section = segments[sectionIndex + 1];
  if (section && SKILLS_TOOLS_SECTIONS.has(section)) {
    return `/agent-ecosystem/skills-tools-mcp/${section}`;
  }
  return null;
}

function resolveBreadcrumbNavPath(segments: string[], index: number): string | null {
  const segment = segments[index];

  if (segment === 'marketplace') {
    return marketplaceListPath(segments);
  }
  if (segment === 'skills-tools-mcp') {
    return skillsToolsListPath(segments);
  }
  // Agent 生态无独立落地页；子模块由下一级面包屑负责返回
  if (segment === 'agent-ecosystem') {
    return null;
  }

  const exact = `/${segments.slice(0, index + 1).join('/')}`;
  if (NAVIGABLE_BREADCRUMB_PATHS.has(exact)) {
    return exact;
  }
  for (let j = index + 1; j < segments.length; j++) {
    const candidate = `/${segments.slice(0, j + 1).join('/')}`;
    if (NAVIGABLE_BREADCRUMB_PATHS.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export type BreadcrumbItem = {
  title: string;
  path?: string;
};

export function buildBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  const path = pathname === '/' ? '/dashboard' : pathname;
  const segments = path.split('/').filter(Boolean);

  return segments.map((segment, index) => {
    const title = breadcrumbTitle(segment);
    if (index === segments.length - 1) {
      return { title };
    }
    const navPath = resolveBreadcrumbNavPath(segments, index);
    return navPath ? { title, path: navPath } : { title };
  });
}

/** 无对应路由的父级菜单 key（仅用于展开，不可 navigate） */
export const NAV_PARENT_KEYS = {
  governance: 'governance',
  identity: 'identity',
  billing: 'billing',
  agentEcosystem: '/agent-ecosystem',
  marketplace: '/agent-ecosystem/marketplace',
  skillsToolsMcp: '/agent-ecosystem/skills-tools-mcp',
} as const;

export function navOpenKeys(pathname: string): string[] {
  const keys: string[] = [NAV_PARENT_KEYS.agentEcosystem];
  if (pathname.startsWith('/rollout') || pathname.includes('collaboration-main-chain')) {
    keys.push(NAV_PARENT_KEYS.governance);
  }
  if (pathname.startsWith('/agent-ecosystem/marketplace')) {
    keys.push(NAV_PARENT_KEYS.marketplace);
  }
  if (pathname.startsWith('/agent-ecosystem/skills-tools-mcp')) {
    keys.push(NAV_PARENT_KEYS.skillsToolsMcp);
  }
  if (pathname.startsWith('/billing')) {
    keys.push(NAV_PARENT_KEYS.billing);
  }
  if (pathname.startsWith('/users')) {
    keys.push(NAV_PARENT_KEYS.identity);
  }
  return keys;
}
