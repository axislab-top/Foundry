import { Bot, FileText, Hand, MessageSquare, Sparkles, Wrench } from "lucide-react";

type Props = {
  sourceType: string;
  size?: "sm" | "md";
};

const SOURCE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  chat: {
    label: "聊天",
    icon: MessageSquare,
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  task: {
    label: "任务",
    icon: Wrench,
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  skill: {
    label: "技能",
    icon: Sparkles,
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  document: {
    label: "文档",
    icon: FileText,
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  summary: {
    label: "摘要",
    icon: Bot,
    className: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  manual: {
    label: "手工录入",
    icon: Hand,
    className: "border-[#1e3a5f]/20 bg-[#1e3a5f]/5 text-[#1e3a5f]",
  },
};

type TagProps = Props & {
  /** 系统同步类记忆（如公司档案） */
  systemSync?: boolean;
};

export default function MemorySourceTag({ sourceType, size = "sm", systemSync }: TagProps) {
  if (systemSync) {
    const sizeClass = size === "md" ? "px-2.5 py-1 text-xs gap-1.5" : "px-2 py-0.5 text-[11px] gap-1";
    return (
      <span
        className={`inline-flex items-center rounded-full border border-blue-200 bg-blue-50 font-medium text-blue-700 ${sizeClass}`}
      >
        <Sparkles className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
        系统同步
      </span>
    );
  }

  const key = String(sourceType || "").toLowerCase();
  const config = SOURCE_CONFIG[key] ?? {
    label: key || "未知",
    icon: FileText,
    className: "border-gray-200 bg-gray-50 text-gray-600",
  };
  const Icon = config.icon;
  const sizeClass = size === "md" ? "px-2.5 py-1 text-xs gap-1.5" : "px-2 py-0.5 text-[11px] gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizeClass} ${config.className}`}
    >
      <Icon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      {config.label}
    </span>
  );
}

export function sourceAccentColor(sourceType: string): string {
  const key = String(sourceType || "").toLowerCase();
  const accents: Record<string, string> = {
    chat: "bg-sky-500",
    task: "bg-violet-500",
    skill: "bg-indigo-500",
    document: "bg-slate-400",
    summary: "bg-cyan-500",
    manual: "bg-[#1e3a5f]",
  };
  return accents[key] ?? "bg-gray-300";
}
