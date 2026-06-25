import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, Calendar, Filter, Plus, RefreshCw, Search } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { syncCompanyProfile } from "@/features/memory/shared/companyProfileApi";
import { useCompanyStore } from "@/shared/store/companyStore";
import { mapMemoryError } from "@/features/memory/shared/errorMapper";
import { memoryKeys } from "@/features/memory/shared/queryKeys";
import {
  useArchiveMemory,
  useCreateMemory,
  useMemoryList,
  useMemorySearch,
  useUnarchiveMemory,
} from "@/features/memory/shared/memoryApi";
import { namespaceForCompany } from "@/features/memory/shared/namespace";
import type { MemoryEntryView, MemorySourceType } from "@/features/memory/shared/types";
import CompanyMemoryDetailDrawer from "@/features/memory/company/components/CompanyMemoryDetailDrawer";
import CompanyMemoryEditorModal from "@/features/memory/company/components/CompanyMemoryEditorModal";
import CompanyMemoryList from "@/features/memory/company/components/CompanyMemoryList";
import MemoryLoadingSkeleton from "@/features/memory/shared/components/MemoryLoadingSkeleton";
import MemoryToast from "@/features/memory/shared/components/MemoryToast";
import MemoryEmptyState from "@/features/memory/shared/components/MemoryEmptyState";
import { isHiddenSystemMemory } from "@/features/memory/shared/memoryDisplay";
import { MEMORY_DATE_OPTIONS, MEMORY_SOURCE_OPTIONS } from "@/features/memory/shared/memoryPageConstants";

export default function CompanyMemoryPage() {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"" | MemorySourceType>("");
  const [dateFilter, setDateFilter] = useState<"" | "7d" | "30d">("");
  const [selectedItem, setSelectedItem] = useState<MemoryEntryView | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, "active" | "archived">>({});
  const [toast, setToast] = useState<{ kind: "success" | "error" | "info"; message: string } | null>(null);
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  const profileSync = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error("未选择公司");
      return syncCompanyProfile(companyId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryKeys.all });
      setToast({ kind: "success", message: "公司档案已刷新" });
    },
    onError: () => {
      setToast({ kind: "error", message: "公司档案刷新失败，请稍后重试" });
    },
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const createdAfter = useMemo(() => {
    if (dateFilter === "7d") {
      return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    }
    if (dateFilter === "30d") {
      return new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    }
    return undefined;
  }, [dateFilter]);

  const hasQuery = query.trim().length > 0;

  const listParams = useMemo(
    () => ({
      namespaces: [namespaceForCompany()],
      sourceTypes: sourceFilter ? [sourceFilter] : undefined,
      createdAfter,
      topK: 50,
    }),
    [createdAfter, sourceFilter],
  );

  const searchParams = useMemo(
    () => ({
      query: query.trim(),
      namespaces: [namespaceForCompany()],
      sourceTypes: sourceFilter ? [sourceFilter] : undefined,
      createdAfter,
      topK: 30,
    }),
    [createdAfter, query, sourceFilter],
  );

  const list = useMemoryList(companyId, "company", listParams, Boolean(companyId) && !hasQuery);
  const search = useMemorySearch(companyId, "company", searchParams, Boolean(companyId) && hasQuery);

  const activeQuery = hasQuery ? search : list;
  const createMutation = useCreateMemory();
  const archiveMutation = useArchiveMemory();
  const unarchiveMutation = useUnarchiveMemory();

  const allItems = useMemo(() => {
    const list = activeQuery.data ?? [];
    return list.map((item) => ({
      ...item,
      status: statusOverrides[item.id] ?? item.status,
    }));
  }, [activeQuery.data, statusOverrides]);

  const visibleItems = useMemo(() => {
    const base = allItems.filter((x) => !isHiddenSystemMemory(x));
    return showArchived ? base : base.filter((x) => x.status !== "archived");
  }, [allItems, showArchived]);

  const archivedCount = useMemo(
    () => allItems.filter((x) => x.status === "archived").length,
    [allItems],
  );

  const onCreate = async (payload: { title: string; content: string }) => {
    await createMutation.mutateAsync({
      namespace: namespaceForCompany(),
      collectionLabel: "Company memories",
      content: payload.content,
      sourceType: "manual",
      metadata: {
        title: payload.title || "未命名记忆",
        status: "active",
      },
    });
    setCreateOpen(false);
    await queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    setToast({ kind: "success", message: "公司记忆已保存" });
  };

  const onToggleArchive = (item: MemoryEntryView) => {
    const nextStatus = item.status === "archived" ? "active" : "archived";
    setStatusOverrides((prev) => ({ ...prev, [item.id]: nextStatus }));
    void (async () => {
      try {
        if (item.status === "archived") {
          await unarchiveMutation.mutateAsync(item.id);
        } else {
          await archiveMutation.mutateAsync(item.id);
        }
        if (selectedItem?.id === item.id) {
          setSelectedItem({ ...item, status: nextStatus });
        }
        await queryClient.invalidateQueries({ queryKey: memoryKeys.all });
        setToast({ kind: "success", message: nextStatus === "archived" ? "记忆已归档" : "记忆已恢复" });
      } catch {
        setStatusOverrides((prev) => ({ ...prev, [item.id]: item.status }));
        setToast({ kind: "error", message: "状态更新失败，请重试" });
      }
    })();
  };

  const onSaveRevision = async (payload: { title: string; content: string }) => {
    if (!selectedItem) return;
    await createMutation.mutateAsync({
      namespace: namespaceForCompany(),
      collectionLabel: "Company memories",
      content: payload.content,
      sourceType: "manual",
      metadata: {
        title: payload.title || "未命名记忆",
        status: "active",
        revisedFrom: selectedItem.id,
      },
    });
    setEditorOpen(false);
    await queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    setToast({ kind: "success", message: "新版本已保存" });
  };

  const hasActiveFilters = Boolean(query.trim() || sourceFilter || dateFilter);

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-white">
      {/* 顶栏 */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-3">
        <div className="mr-2 shrink-0">
          <h2 className="text-[15px] font-semibold text-gray-900">公司记忆</h2>
          <p className="text-[11px] text-gray-400">Company Memory</p>
        </div>

        <div className="relative min-w-[180px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索记忆..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as "" | MemorySourceType)}
            className="rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm text-gray-700 focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
          >
            {MEMORY_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as "" | "7d" | "30d")}
            className="rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm text-gray-700 focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
          >
            {MEMORY_DATE_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-600 transition-colors hover:bg-gray-50">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]/20"
          />
          <Archive className="h-3.5 w-3.5" />
          归档
          {archivedCount > 0 ? <span className="text-gray-400">({archivedCount})</span> : null}
        </label>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void profileSync.mutate()}
            disabled={!companyId || profileSync.isPending}
            title={companyId ? "从最新公司资料与组织架构重新同步" : "请先选择公司"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <RefreshCw className={`h-4 w-4 ${profileSync.isPending ? "animate-spin" : ""}`} />
            刷新公司档案
          </button>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]"
          >
            <Plus className="h-4 w-4" />
            新增
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast ? (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2">
          <MemoryToast kind={toast.kind} message={toast.message} />
        </div>
      ) : null}

      {/* 主区域：左列表 + 右详情 */}
      <div className="relative flex min-h-0 flex-1">
        {/* 左侧列表 — 固定宽度 */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-gray-200 xl:w-[340px]">
          <div className="shrink-0 border-b border-gray-100 px-4 py-2 text-[11px] text-gray-400">
            {activeQuery.isLoading ? "加载中..." : `${visibleItems.length} 条记忆`}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeQuery.isLoading ? <MemoryLoadingSkeleton /> : null}
            {activeQuery.error ? (
              <p className="px-4 py-6 text-sm text-rose-600">{mapMemoryError(activeQuery.error)}</p>
            ) : null}
            {archiveMutation.error ? (
              <p className="px-4 py-2 text-sm text-rose-600">{mapMemoryError(archiveMutation.error)}</p>
            ) : null}
            {unarchiveMutation.error ? (
              <p className="px-4 py-2 text-sm text-rose-600">{mapMemoryError(unarchiveMutation.error)}</p>
            ) : null}
            {!activeQuery.isLoading && !activeQuery.error ? (
              visibleItems.length ? (
                <CompanyMemoryList
                  items={visibleItems}
                  selectedId={selectedItem?.id}
                  onSelect={setSelectedItem}
                />
              ) : (
                <MemoryEmptyState
                  title={hasActiveFilters ? "无匹配结果" : "暂无记忆"}
                  description={
                    hasActiveFilters ? "调整筛选条件试试" : "点击右上角新增，或等待 Agent 自动沉淀"
                  }
                  actionLabel={hasActiveFilters ? undefined : "新增记忆"}
                  onAction={hasActiveFilters ? undefined : () => setCreateOpen(true)}
                  variant={hasActiveFilters ? "search" : "default"}
                />
              )
            ) : null}
          </div>
        </div>

        {/* 右侧详情 — 自适应剩余宽度 */}
        <div className="hidden min-w-0 flex-1 md:flex md:flex-col">
          <CompanyMemoryDetailDrawer
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onEdit={(item) => {
              setSelectedItem(item);
              setEditorOpen(true);
            }}
            onToggleArchive={onToggleArchive}
            onRefreshProfile={companyId ? () => void profileSync.mutate() : undefined}
            profileRefreshing={profileSync.isPending}
          />
        </div>

        {/* 移动端：未选中时提示 */}
        {!selectedItem ? (
          <div className="flex flex-1 items-center justify-center md:hidden">
            <p className="text-[13px] text-gray-400">选择一条记忆查看详情</p>
          </div>
        ) : null}
      </div>

      {/* 移动端详情抽屉 */}
      <AnimatePresence>
        {selectedItem ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 md:hidden"
          >
            <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedItem(null)} />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.2 }}
              className="absolute inset-y-0 right-0 w-full shadow-xl"
            >
              <CompanyMemoryDetailDrawer
                variant="overlay"
                item={selectedItem}
                onClose={() => setSelectedItem(null)}
                onEdit={(item) => {
                  setSelectedItem(item);
                  setEditorOpen(true);
                }}
                onToggleArchive={onToggleArchive}
                onRefreshProfile={companyId ? () => void profileSync.mutate() : undefined}
                profileRefreshing={profileSync.isPending}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CompanyMemoryEditorModal
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSubmit={onCreate}
        submitting={createMutation.isPending}
      />

      <CompanyMemoryEditorModal
        open={editorOpen}
        mode="edit"
        initial={selectedItem}
        onClose={() => setEditorOpen(false)}
        onSubmit={onSaveRevision}
        submitting={createMutation.isPending}
      />
    </section>
  );
}
