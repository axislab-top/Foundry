import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Clock,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import MemorySourceTag from "@/features/memory/shared/components/MemorySourceTag";
import MemoryStatusTag from "@/features/memory/shared/components/MemoryStatusTag";
import {
  getMemorySourceHint,
  resolveMemoryPreview,
} from "@/features/memory/shared/memoryDisplay";
import type { MemoryEntryView } from "@/features/memory/shared/types";

type Props = {
  item: MemoryEntryView | null;
  onClose: () => void;
  onEdit: (item: MemoryEntryView) => void;
  onToggleArchive: (item: MemoryEntryView) => void;
  variant?: "panel" | "overlay";
  /** 如部门记忆页传入「所属部门：市场部」 */
  contextHint?: string | null;
  onRefreshProfile?: () => void;
  profileRefreshing?: boolean;
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <Pencil className="h-7 w-7 text-gray-300" />
      </div>
      <p className="text-[15px] font-medium text-gray-700">选择一条记忆查看</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-gray-400">
        从左侧列表选择记忆，在此阅读完整内容并进行编辑或归档
      </p>
    </div>
  );
}

export default function CompanyMemoryDetailDrawer({
  item,
  onClose,
  onEdit,
  onToggleArchive,
  variant = "panel",
  contextHint,
  onRefreshProfile,
  profileRefreshing,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isOverlay = variant === "overlay";
  const isSystemProfile = item?.metadata?.kind === "company_profile";

  return (
    <aside className={`flex h-full w-full flex-col bg-white ${isOverlay ? "" : ""}`}>
      {/* 顶栏 */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-3">
        {item ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MemorySourceTag
              sourceType={item.sourceType}
              size="md"
              systemSync={item.metadata?.kind === "company_profile"}
            />
            <MemoryStatusTag status={item.status} />
          </div>
        ) : (
          <span className="text-[13px] text-gray-400">记忆详情</span>
        )}
        {isOverlay ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        ) : item ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-3 shrink-0 text-[12px] text-gray-400 transition-colors hover:text-gray-600"
          >
            关闭
          </button>
        ) : null}
      </div>

      {!item ? (
        <DetailEmptyState />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-8">
              <h1 className="text-2xl font-bold leading-snug text-gray-900">{item.title}</h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDate(item.createdAt)}
                </span>
                {contextHint ? <span>{contextHint}</span> : null}
              </div>

              {getMemorySourceHint(item) ? (
                <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[13px] leading-relaxed text-blue-800/90">
                  {getMemorySourceHint(item)}
                </p>
              ) : null}

              <div className="mt-8 whitespace-pre-wrap break-words text-[15px] leading-[1.75] text-gray-700">
                {resolveMemoryPreview(item)}
              </div>

              {item.metadata && Object.keys(item.metadata).length > 0 ? (
                <div className="mt-10 border-t border-gray-100 pt-6">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400 transition-colors hover:text-gray-600"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                    />
                    高级信息
                  </button>
                  {showAdvanced ? (
                    <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-4 text-[12px]">
                      <div>
                        <span className="text-gray-400">命名空间</span>
                        <code className="mt-0.5 block text-gray-600">{item.namespace}</code>
                      </div>
                      {Object.entries(item.metadata).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-gray-400">{key}</span>
                          <div className="mt-0.5 text-gray-600">
                            {typeof value === "object" ? JSON.stringify(value) : String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-100 px-6 py-3">
            <div className="mx-auto max-w-3xl">
              {isSystemProfile ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] text-gray-400">
                    系统档案由公司与组织架构自动维护，无需手动编辑或归档。
                  </p>
                  {onRefreshProfile ? (
                    <button
                      type="button"
                      onClick={onRefreshProfile}
                      disabled={profileRefreshing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${profileRefreshing ? "animate-spin" : ""}`} />
                      {profileRefreshing ? "刷新中..." : "刷新档案"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#2d5a8e]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    编辑为新版本
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleArchive(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    {item.status === "archived" ? (
                      <>
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        取消归档
                      </>
                    ) : (
                      <>
                        <Archive className="h-3.5 w-3.5" />
                        归档
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
