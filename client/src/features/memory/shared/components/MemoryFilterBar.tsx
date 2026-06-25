import { Calendar, Filter, Search } from "lucide-react";
import type { MemorySourceType } from "@/features/memory/shared/types";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  sourceFilter?: "" | MemorySourceType;
  onSourceFilterChange?: (value: "" | MemorySourceType) => void;
  dateFilter?: "" | "7d" | "30d";
  onDateFilterChange?: (value: "" | "7d" | "30d") => void;
  extraLeft?: React.ReactNode;
  variant?: "default" | "compact";
};

const selectClass =
  "rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-700 focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10";

export default function MemoryFilterBar({
  query,
  onQueryChange,
  sourceFilter = "",
  onSourceFilterChange,
  dateFilter = "",
  onDateFilterChange,
  extraLeft,
  variant = "default",
}: Props) {
  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索记忆内容..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
          />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <select
            value={sourceFilter}
            onChange={(e) => onSourceFilterChange?.(e.target.value as "" | MemorySourceType)}
            className={`${selectClass} min-w-[120px]`}
          >
            <option value="">全部来源</option>
            <option value="chat">聊天</option>
            <option value="task">任务</option>
            <option value="skill">技能</option>
            <option value="summary">摘要</option>
            <option value="manual">手工录入</option>
            <option value="document">文档</option>
          </select>
        </div>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <select
            value={dateFilter}
            onChange={(e) => onDateFilterChange?.(e.target.value as "" | "7d" | "30d")}
            className={`${selectClass} min-w-[120px]`}
          >
            <option value="">全部时间</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
          </select>
        </div>
        {extraLeft}
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-4">
      <div className="md:col-span-2">
        <label className="mb-2 block text-xs font-medium text-gray-600">搜索</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索记忆"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
          />
        </div>
      </div>
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-600">来源</label>
        <select
          value={sourceFilter}
          onChange={(e) => onSourceFilterChange?.(e.target.value as "" | MemorySourceType)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
        >
          <option value="">全部来源</option>
          <option value="chat">聊天</option>
          <option value="task">任务</option>
          <option value="skill">技能</option>
          <option value="summary">摘要</option>
          <option value="manual">手工录入</option>
          <option value="document">文档</option>
        </select>
      </div>
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-600">时间</label>
        <select
          value={dateFilter}
          onChange={(e) => onDateFilterChange?.(e.target.value as "" | "7d" | "30d")}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
        >
          <option value="">全部时间</option>
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
        </select>
      </div>
      {extraLeft ? <div className="md:col-span-4">{extraLeft}</div> : null}
    </div>
  );
}
