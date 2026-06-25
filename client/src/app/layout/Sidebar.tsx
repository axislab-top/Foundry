import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Briefcase,
  CircleDollarSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileCheck,
  FolderTree,
  History,
  FileText,
  ListTodo,
  Lock,
  LogOut,
  MessagesSquare,
  Network,
  Store,
  Wallet,
  Users,
  Activity,
  CalendarClock,
  Zap,
} from "lucide-react";
import { logoutUser } from "@/shared/auth/logout";
import CompanySwitcherWidget from "@/widgets/CompanySwitcherWidget/CompanySwitcherWidget";
import { OnboardingChecklist } from "@/features/onboarding";

const SIDEBAR_EXPANDED_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 60;
const STORAGE_KEY = "sidebar_collapsed";

type SidebarNavItem = {
  to: string;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  navDataOnboarding?: string;
  children?: SidebarNavItem[];
};

type SidebarSection = {
  title?: string;
  items: SidebarNavItem[];
};

const navSections: SidebarSection[] = [
  {
    title: "协作空间",
    items: [
      { to: "/collaboration/chats", icon: MessagesSquare, label: "所有群聊" },
    ],
  },
  {
    title: "工作空间",
    items: [
      { to: "/home/daily-brief", icon: Zap, label: "今日快报", navDataOnboarding: "nav-daily-brief" },
      { to: "/organization", icon: Network, label: "组织架构图" },
      { to: "/agent-team", icon: Users, label: "Agent 团队" },
    ],
  },
  {
    title: "任务与执行",
    items: [
      { to: "/tasks/center", icon: ListTodo, label: "任务中心" },
      { to: "/projects", icon: Briefcase, label: "项目管理" },
      { to: "/tasks/logs", icon: ClipboardList, label: "执行日志" },
      { to: "/tasks/heartbeat", icon: Activity, label: "自治 Heartbeat" },
      { to: "/tasks/schedules", icon: CalendarClock, label: "定时 Playbook" },
    ],
  },
  {
    title: "AI 组织",
    items: [
      {
        to: "/ai/recruitment-market",
        icon: Store,
        label: "招聘市场",
        // [MOCK] 内部市场和插件商城子导航已移除，后端暂不支持，页面文件保留
        // 恢复时取消下方注释
        // children: [
        //   { to: "/ai/recruitment-market/internal", label: "内部市场" },
        //   { to: "/ai/recruitment-market/plugins", label: "插件商城" },
        // ],
      },
    ],
  },
  {
    title: "记忆与知识库",
    items: [
      { to: "/memory/company", icon: Database, label: "公司记忆" },
      { to: "/memory/departments", icon: FolderTree, label: "部门记忆" },
      { to: "/memory/agents", icon: BrainCircuit, label: "Agent 记忆" },
      { to: "/memory/files", icon: FileCheck, label: "文件库" },
      { to: "/memory/graph", icon: Network, label: "知识图谱" },
    ],
  },
  {
    title: "治理与成本",
    items: [
      { to: "/governance/billing", icon: Wallet, label: "预算与账单" },
      { to: "/costs", icon: CircleDollarSign, label: "AI 成本追踪" },
      { to: "/governance/approvals", icon: FileText, label: "审批中心" },
      { to: "/governance/risk", icon: Activity, label: "风险监控" },
      { to: "/governance/audit", icon: History, label: "审计日志" },
      { to: "/governance/security", icon: Lock, label: "权限与安全" },
    ],
  },
];

function SectionHeader({ title, className }: { title: string; className?: string }) {
  return (
    <div className={`px-5 pb-2 pt-6 text-[12px] font-semibold uppercase tracking-wider text-gray-400 ${className ?? ""}`}>
      {title}
    </div>
  );
}

function SidebarItem({
  item,
  depth = 0,
  pathname,
  collapsed,
}: {
  item: SidebarNavItem;
  depth?: number;
  pathname: string;
  collapsed: boolean;
}) {
  const hasChildren = !!item.children?.length;
  const isChildActive = hasChildren ? item.children!.some((child) => pathname === child.to || pathname.startsWith(`${child.to}/`)) : false;
  const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`) || isChildActive;
  const [isOpen, setIsOpen] = useState(isActive);

  const Icon = item.icon;
  const rowClass = `group mx-2 flex items-center rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors ${
    isActive ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-100"
  }`;

  // 折叠状态下，子菜单项不渲染
  if (collapsed && depth > 0) return null;

  return (
    <div className="w-full">
      <div className={rowClass} style={{ paddingLeft: collapsed ? "0px" : `${depth * 12 + 12}px`, justifyContent: collapsed ? "center" : "flex-start" }}>
        <Link to={item.to} className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "flex-1"}`} data-onboarding={item.navDataOnboarding}>
          {Icon ? (
            <Icon
              className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-blue-600" : "text-gray-500"} ${collapsed ? "" : "mr-2.5"}`}
            />
          ) : null}
          {collapsed ? null : <span className="truncate">{item.label}</span>}
        </Link>
        {!collapsed && item.badge ? (
          <span className="ml-2 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{item.badge}</span>
        ) : null}
        {!collapsed && hasChildren ? (
          <button
            type="button"
            aria-label={isOpen ? `收起${item.label}` : `展开${item.label}`}
            onClick={() => setIsOpen((prev) => !prev)}
            className="ml-1 text-gray-400"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>
      {!collapsed && hasChildren && isOpen ? (
        <div className="mt-0.5">
          {item.children!.map((child) => (
            <SidebarItem key={child.to} item={child} depth={depth + 1} pathname={pathname} collapsed={collapsed} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const pathname = useMemo(() => location.pathname, [location.pathname]);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutUser();
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut]);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <motion.aside
      className="relative flex select-none flex-col border-r border-gray-200 bg-[#f7f7f5]"
      initial={false}
      animate={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      {/* 折叠/展开切换按钮 */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition-colors hover:bg-gray-100"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5 text-gray-500" />
        )}
      </button>

      {/* 公司切换器 */}
      <div className="px-3 py-4">
        {collapsed ? (
          <div className="flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white shadow-inner">
              F
            </div>
          </div>
        ) : (
          <CompanySwitcherWidget />
        )}
      </div>
      <div className="border-b border-gray-200" />

      {/* 导航区域 */}
      <nav className="no-scrollbar flex-1 overflow-y-auto pb-10">
        {navSections.map((section, sectionIndex) => (
          <div key={section.title ?? `section-${sectionIndex}`} className={sectionIndex === 0 ? "mt-2" : ""}>
            {collapsed ? null : section.title ? <SectionHeader title={section.title} className={sectionIndex === 0 ? "pt-3" : ""} /> : null}
            {section.items.map((item) => (
              <SidebarItem key={item.to} item={item} pathname={pathname} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      <OnboardingChecklist sidebarCollapsed={collapsed} />

      {/* 底部操作区 */}
      <div className="border-t border-gray-200 bg-[#f7f7f5] p-3">
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          title="退出登录"
          aria-label="退出登录"
          className={`flex w-full items-center rounded-md px-3 py-2 text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 ${
            collapsed ? "justify-center" : "gap-2.5"
          }`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-gray-500" />
          {collapsed ? null : <span>{loggingOut ? "退出中…" : "退出登录"}</span>}
        </button>
      </div>
    </motion.aside>
  );
}
