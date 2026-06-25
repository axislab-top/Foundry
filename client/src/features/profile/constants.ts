import {
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  FileSearch,
  Shield,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type ProfileTab = "overview" | "workspaces" | "security";

export type QuickLinkGroup = {
  title: string;
  subtitle: string;
  items: QuickLinkItem[];
};

export type QuickLinkItem = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const PROFILE_TABS: { key: ProfileTab; label: string; subtitle: string }[] = [
  { key: "overview", label: "概览", subtitle: "Overview" },
  { key: "workspaces", label: "工作空间", subtitle: "Workspaces" },
  { key: "security", label: "账号与安全", subtitle: "Account & Security" },
];

export const QUICK_LINK_GROUPS: QuickLinkGroup[] = [
  {
    title: "财务与成本",
    subtitle: "Finance",
    items: [
      {
        to: "/governance/billing",
        label: "预算与账单",
        description: "Credit 额度、购额记录与消费明细",
        icon: Wallet,
      },
      {
        to: "/costs",
        label: "AI 成本追踪",
        description: "按 Agent 与时间维度分析成本",
        icon: CircleDollarSign,
      },
    ],
  },
  {
    title: "治理与合规",
    subtitle: "Governance",
    items: [
      {
        to: "/governance/approvals",
        label: "审批中心",
        description: "待办审批与历史记录",
        icon: ClipboardCheck,
      },
      {
        to: "/governance/security",
        label: "权限与安全",
        description: "角色权限、API 密钥与安全策略",
        icon: Shield,
      },
      {
        to: "/governance/audit",
        label: "审计日志",
        description: "操作记录与合规追溯",
        icon: FileSearch,
      },
      {
        to: "/governance/risk",
        label: "风险监控",
        description: "异常行为与风险告警",
        icon: ShieldAlert,
      },
    ],
  },
  {
    title: "工作空间",
    subtitle: "Workspace",
    items: [
      {
        to: "/company-select",
        label: "切换工作空间",
        description: "选择或创建其他公司",
        icon: Building2,
      },
    ],
  },
];
