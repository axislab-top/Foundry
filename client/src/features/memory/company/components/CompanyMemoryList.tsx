import MemorySourceTag from "@/features/memory/shared/components/MemorySourceTag";
import MemoryStatusTag from "@/features/memory/shared/components/MemoryStatusTag";
import { resolveMemoryPreview } from "@/features/memory/shared/memoryDisplay";
import type { MemoryEntryView } from "@/features/memory/shared/types";

type Props = {
  items: MemoryEntryView[];
  selectedId?: string;
  onSelect: (item: MemoryEntryView) => void;
};

function relativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export default function CompanyMemoryList({ items, selectedId, onSelect }: Props) {
  if (!items.length) {
    return null;
  }

  return (
    <div>
      {items.map((item) => {
        const isSelected = selectedId === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={`relative w-full border-b border-gray-100 px-4 py-3 text-left transition-colors ${
              isSelected
                ? "bg-blue-50/70 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[#1e3a5f]"
                : "hover:bg-gray-50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`truncate text-[13px] font-medium ${isSelected ? "text-[#1e3a5f]" : "text-gray-900"}`}>
                {item.title}
              </p>
              <span className="shrink-0 text-[11px] text-gray-400">{relativeTime(item.createdAt)}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-gray-500">
              {resolveMemoryPreview(item)}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <MemorySourceTag
                sourceType={item.sourceType}
                systemSync={item.metadata?.kind === "company_profile"}
              />
              {item.status === "archived" ? <MemoryStatusTag status={item.status} /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
