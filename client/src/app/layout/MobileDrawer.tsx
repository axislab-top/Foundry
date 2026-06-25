import { useState, useCallback, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Menu,
  X,
  BrainCircuit,
  Briefcase,
  CircleDollarSign,
  ChevronDown,
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

type NavItem = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children?: { to: string; label: string }[];
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "协作空间",
    items: [{ to: "/collaboration/chats", icon: MessagesSquare, label: "所有群聊" }],
  },
  {
    title: "工作空间",
    items: [
      { to: "/home/daily-brief", icon: Zap, label: "今日快报" },
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
    items: [{ to: "/ai/recruitment-market", icon: Store, label: "招聘市场" }],
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

function DrawerNavItem({ item, pathname, onClose }: { item: NavItem; pathname: string; onClose: () => void }) {
  const hasChildren = !!item.children?.length;
  const isChildActive = hasChildren ? item.children!.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`)) : false;
  const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`) || isChildActive;
  const [open, setOpen] = useState(isActive);
  const Icon = item.icon;

  return (
    <div>
      <div
        className={`flex items-center rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors ${
          isActive ? "bg-blue-50 text-blue-600" : "text-gray-700 active:bg-gray-100"
        }`}
      >
        <Link
          to={item.to}
          className="flex flex-1 items-center gap-3"
          onClick={() => {
            if (!hasChildren) onClose();
          }}
        >
          <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-blue-600" : "text-gray-500"}`} />
          <span className="truncate">{item.label}</span>
        </Link>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-1 text-gray-400"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hasChildren && open && (
        <div className="ml-9 mt-0.5 space-y-0.5">
          {item.children!.map((child) => {
            const childActive = pathname === child.to;
            return (
              <Link
                key={child.to}
                to={child.to}
                onClick={onClose}
                className={`block rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  childActive ? "bg-blue-50 text-blue-600 font-medium" : "text-gray-600 active:bg-gray-100"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MobileDrawer() {
  const location = useLocation();
  const pathname = location.pathname;
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // 路由变化时自动关闭抽屉
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 打开时禁止背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutUser();
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut]);

  return (
    <>
      {/* 汉堡按钮 — 仅移动端显示 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 md:hidden"
        aria-label="打开导航菜单"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* 抽屉遮罩 + 面板 */}
      {open && (
        <div className="fixed inset-0 z-[200] md:hidden">
          {/* 遮罩 */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* 面板 */}
          <nav className="absolute inset-y-0 left-0 flex w-[280px] max-w-[80vw] flex-col bg-[#f7f7f5] shadow-2xl">
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white shadow-inner">
                  F
                </div>
                <span className="text-[15px] font-bold text-gray-900">Foundry</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                aria-label="关闭菜单"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 导航列表 */}
            <div className="no-scrollbar flex-1 overflow-y-auto py-2">
              {navSections.map((section, si) => (
                <div key={section.title ?? si} className={si === 0 ? "" : "mt-1"}>
                  {section.title && (
                    <div className="px-4 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {section.title}
                    </div>
                  )}
                  <div className="space-y-0.5 px-2">
                    {section.items.map((item) => (
                      <DrawerNavItem key={item.to} item={item} pathname={pathname} onClose={() => setOpen(false)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 底部退出 */}
            <div className="border-t border-gray-200 bg-[#f7f7f5] p-3">
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-[18px] w-[18px] shrink-0 text-gray-500" />
                <span>{loggingOut ? "退出中…" : "退出登录"}</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
