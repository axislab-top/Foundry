import { Brain, Plus, Search } from "lucide-react";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "default" | "search";
};

export default function MemoryEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = "default",
}: Props) {
  const Icon = variant === "search" ? Search : Brain;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
        <Icon className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="text-[15px] font-semibold text-gray-800">{title}</h3>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-gray-500">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
