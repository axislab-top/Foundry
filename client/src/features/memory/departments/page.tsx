import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, Calendar, Filter, Plus, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useArchiveMemory,
  useCreateMemory,
  useMemoryList,
  useMemorySearch,
  useUnarchiveMemory,
} from "@/features/memory/shared/memoryApi";
import { mapMemoryError } from "@/features/memory/shared/errorMapper";
import {
  findCompanyDepartment,
  listCompanyDepartments,
} from "@/features/memory/shared/companyDepartmentsApi";
import {
  isDepartmentNamespace,
  memoryMatchesCompanyDepartment,
  namespaceForDepartment,
} from "@/features/memory/shared/namespace";
import type { MemoryEntryView, MemorySourceType } from "@/features/memory/shared/types";
import { memoryKeys } from "@/features/memory/shared/queryKeys";
import { useCompanyStore } from "@/shared/store/companyStore";
import {
  isHiddenSystemMemory,
  resolveDepartmentContextLabel,
} from "@/features/memory/shared/memoryDisplay";
import { MEMORY_DATE_OPTIONS, MEMORY_SOURCE_OPTIONS } from "@/features/memory/shared/memoryPageConstants";
import CompanyMemoryDetailDrawer from "@/features/memory/company/components/CompanyMemoryDetailDrawer";
import CompanyMemoryEditorModal from "@/features/memory/company/components/CompanyMemoryEditorModal";
import CompanyMemoryList from "@/features/memory/company/components/CompanyMemoryList";
import DepartmentMemorySidebar from "@/features/memory/departments/components/DepartmentMemorySidebar";
import MemoryLoadingSkeleton from "@/features/memory/shared/components/MemoryLoadingSkeleton";
import MemoryToast from "@/features/memory/shared/components/MemoryToast";
import MemoryEmptyState from "@/features/memory/shared/components/MemoryEmptyState";

export default function DepartmentMemoryPage() {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"" | MemorySourceType>("");
  const [dateFilter, setDateFilter] = useState<"" | "7d" | "30d">("");
  const [selectedDeptKey, setSelectedDeptKey] = useState("");
  const [selectedItem, setSelectedItem] = useState<MemoryEntryView | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, "active" | "archived">>({});
  const [toast, setToast] = useState<{ kind: "success" | "error" | "info"; message: string } | null>(null);

  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const departments = useQuery({
    queryKey: memoryKeys.companyDepartments(companyId),
    queryFn: listCompanyDepartments,
    enabled: Boolean(companyId),
  });
  const queryClient = useQueryClient();
  const createMutation = useCreateMemory();
  const archiveMutation = useArchiveMemory();
  const unarchiveMutation = useUnarchiveMemory();

  const companyDepartments = departments.data ?? [];

  const selectedDepartment = useMemo(
    () => findCompanyDepartment(companyDepartments, selectedDeptKey),
    [companyDepartments, selectedDeptKey],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setSelectedItem(null);
  }, [selectedDeptKey]);

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
      sourceTypes: sourceFilter ? [sourceFilter] : undefined,
      createdAfter,
      topK: 50,
    }),
    [createdAfter, sourceFilter],
  );

  const searchParams = useMemo(
    () => ({
      query: query.trim(),
      sourceTypes: sourceFilter ? [sourceFilter] : undefined,
      createdAfter,
      topK: 50,
    }),
    [createdAfter, query, sourceFilter],
  );

  const list = useMemoryList(companyId, "department", listParams, Boolean(companyId) && !hasQuery);
  const search = useMemorySearch(companyId, "department", searchParams, Boolean(companyId) && hasQuery);

  const activeQuery = hasQuery ? search : list;

  const allItems = useMemo(() => {
    const list = activeQuery.data ?? [];
    return list
      .filter((item) => isDepartmentNamespace(item.namespace))
      .filter((item) =>
        companyDepartments.some((dept) => memoryMatchesCompanyDepartment(item.namespace, dept)),
      )
      .map((item) => ({
        ...item,
        status: statusOverrides[item.id] ?? item.status,
      }));
  }, [activeQuery.data, statusOverrides, companyDepartments]);

  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = { "": 0 };
    for (const dept of companyDepartments) counts[dept.nodeId] = 0;

    for (const item of allItems) {
      if (isHiddenSystemMemory(item)) continue;
      if (item.status === "archived" && !showArchived) continue;
      counts[""]++;
      for (const dept of companyDepartments) {
        if (memoryMatchesCompanyDepartment(item.namespace, dept)) {
          counts[dept.nodeId]++;
          break;
        }
      }
    }
    return counts;
  }, [allItems, companyDepartments, showArchived]);

  const visibleItems = useMemo(() => {
    const base = allItems.filter((x) => !isHiddenSystemMemory(x));
    const scoped = base.filter((item) =>
      memoryMatchesCompanyDepartment(item.namespace, selectedDepartment),
    );
    return showArchived ? scoped : scoped.filter((x) => x.status !== "archived");
  }, [allItems, selectedDepartment, showArchived]);

  const archivedCount = useMemo(
    () =>
      allItems.filter(
        (x) =>
          !isHiddenSystemMemory(x) &&
          memoryMatchesCompanyDepartment(x.namespace, selectedDepartment) &&
          x.status === "archived",
      ).length,
    [allItems, selectedDepartment],
  );

  const deptNameBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of companyDepartments) map[d.slug] = d.name;
    return map;
  }, [companyDepartments]);

  const deptNameByNodeId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of companyDepartments) map[d.nodeId] = d.name;
    return map;
  }, [companyDepartments]);

  const detailContextHint = useMemo(() => {
    if (!selectedItem) return null;
    return resolveDepartmentContextLabel(
      selectedItem.namespace,
      deptNameBySlug,
      deptNameByNodeId,
    );
  }, [selectedItem, deptNameBySlug, deptNameByNodeId]);

  const onCreate = async (payload: { title: string; content: string }) => {
    if (!selectedDepartment) return;
    await createMutation.mutateAsync({
      namespace: namespaceForDepartment(selectedDepartment.slug),
      collectionLabel: "Department memories",
      content: payload.content,
      sourceType: "manual",
      metadata: {
        title: payload.title || "未命名记忆",
        status: "active",
        departmentSlug: selectedDepartment.slug,
        organizationNodeId: selectedDepartment.nodeId,
      },
    });
    setCreateOpen(false);
    await queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    setToast({ kind: "success", message: `已保存到「${selectedDepartment.name}」` });
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
    const namespace = selectedDepartment
      ? namespaceForDepartment(selectedDepartment.slug)
      : selectedItem?.namespace;
    if (!namespace || !selectedItem) return;
    await createMutation.mutateAsync({
      namespace,
      collectionLabel: "Department memories",
      content: payload.content,
      sourceType: "manual",
      metadata: {
        title: payload.title || "未命名记忆",
        status: "active",
        revisedFrom: selectedItem.id,
        ...(selectedDepartment
          ? {
              departmentSlug: selectedDepartment.slug,
              organizationNodeId: selectedDepartment.nodeId,
            }
          : {}),
      },
    });
    setEditorOpen(false);
    await queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    setToast({ kind: "success", message: "新版本已保存" });
  };

  const hasActiveFilters = Boolean(query.trim() || sourceFilter || dateFilter);
  const canCreate = Boolean(selectedDepartment);

  const emptyTitle = !selectedDepartment
    ? companyDepartments.length === 0
      ? "尚未配置部门"
      : "选择部门查看记忆"
    : hasActiveFilters
      ? "无匹配结果"
      : "该部门暂无记忆";

  const emptyDescription = !selectedDepartment
    ? companyDepartments.length === 0
      ? "请先在「组织架构图」中为该公司添加部门"
      : "在左侧选择具体部门，查看该部门的聊天、任务与手工沉淀"
    : hasActiveFilters
      ? "调整搜索或筛选条件试试"
      : "可为本部门新增记忆，或等待 Agent 在执行中自动沉淀";

  return (
    <section className="relative flex h-full overflow-hidden bg-white">
      <DepartmentMemorySidebar
        departments={companyDepartments}
        selectedKey={selectedDeptKey}
        onSelect={setSelectedDeptKey}
        counts={departmentCounts}
        loading={departments.isLoading || activeQuery.isLoading}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-3">
          {selectedDepartment ? (
            <div className="mr-1 shrink-0">
              <p className="text-[11px] text-gray-400">当前部门</p>
              <p className="text-[14px] font-semibold text-gray-900">{selectedDepartment.name}</p>
            </div>
          ) : (
            <p className="mr-1 shrink-0 text-[13px] text-gray-500">本公司全部部门记忆</p>
          )}

          <div className="relative min-w-[160px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索部门记忆..."
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

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!canCreate}
            title={canCreate ? undefined : "请先在左侧选择部门"}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            <Plus className="h-4 w-4" />
            新增
          </button>
        </div>

        {toast ? (
          <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2">
            <MemoryToast kind={toast.kind} message={toast.message} />
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1">
          <div className="flex w-[300px] shrink-0 flex-col border-r border-gray-200 xl:w-[340px]">
            <div className="shrink-0 border-b border-gray-100 px-4 py-2 text-[11px] text-gray-400">
              {activeQuery.isLoading ? "加载中..." : `${visibleItems.length} 条记忆`}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {activeQuery.isLoading ? <MemoryLoadingSkeleton /> : null}
              {activeQuery.error ? (
                <p className="px-4 py-6 text-sm text-rose-600">{mapMemoryError(activeQuery.error)}</p>
              ) : null}
              {departments.error ? (
                <p className="px-4 py-2 text-sm text-rose-600">公司部门列表加载失败</p>
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
                    title={emptyTitle}
                    description={emptyDescription}
                    actionLabel={canCreate && !hasActiveFilters ? "新增部门记忆" : undefined}
                    onAction={canCreate && !hasActiveFilters ? () => setCreateOpen(true) : undefined}
                    variant={hasActiveFilters ? "search" : "default"}
                  />
                )
              ) : null}
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 md:flex md:flex-col">
            <CompanyMemoryDetailDrawer
              item={selectedItem}
              contextHint={detailContextHint}
              onClose={() => setSelectedItem(null)}
              onEdit={(item) => {
                setSelectedItem(item);
                setEditorOpen(true);
              }}
              onToggleArchive={onToggleArchive}
            />
          </div>

          {!selectedItem ? (
            <div className="flex flex-1 items-center justify-center md:hidden">
              <p className="text-[13px] text-gray-400">选择一条记忆查看详情</p>
            </div>
          ) : null}
        </div>
      </div>

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
                contextHint={detailContextHint}
                onClose={() => setSelectedItem(null)}
                onEdit={(item) => {
                  setSelectedItem(item);
                  setEditorOpen(true);
                }}
                onToggleArchive={onToggleArchive}
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
