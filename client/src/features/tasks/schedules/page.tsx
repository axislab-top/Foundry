import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Plus, RefreshCw } from "lucide-react";
import { useCompanyStore } from "@/shared/store/companyStore";
import { fetchAgents } from "@/features/organization/api/organizationApi";
import { organizationKeys } from "@/features/organization/api/queryKeys";
import {
  createScheduledPlaybook,
  deleteScheduledPlaybook,
  listScheduledPlaybooks,
  triggerScheduledPlaybookNow,
  updateScheduledPlaybook,
} from "./schedules-api";
import { computeScheduleStats } from "./schedulesModel";
import { scheduleKeys } from "./queryKeys";
import type { CreateScheduledPlaybookPayload, ScheduledPlaybookViewModel } from "./schedules-types";
import ScheduleStatCards from "./components/ScheduleStatCards";
import ScheduleListTable from "./components/ScheduleListTable";
import ScheduleDetailPanel from "./components/ScheduleDetailPanel";
import ScheduleEmptyState from "./components/ScheduleEmptyState";
import ScheduleFormDrawer from "./components/ScheduleFormDrawer";

export default function SchedulesPage() {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledPlaybookViewModel | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
    setDrawerOpen(false);
    setEditing(null);
    setBusyId(null);
    setMessage(null);
  }, [companyId]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const schedulesQuery = useQuery({
    queryKey: scheduleKeys.list(companyId),
    queryFn: () => listScheduledPlaybooks(companyId!),
    enabled: !!companyId,
  });

  const agentsQuery = useQuery({
    queryKey: organizationKeys.agents(companyId),
    queryFn: () => fetchAgents(),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const items = schedulesQuery.data?.items ?? [];
  const stats = useMemo(() => computeScheduleStats(items), [items]);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const agents = useMemo(
    () => (agentsQuery.data ?? []).map((a) => ({ id: a.id, name: a.name ?? a.id })),
    [agentsQuery.data],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: scheduleKeys.list(companyId) });
  }, [companyId, queryClient]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateScheduledPlaybookPayload) => createScheduledPlaybook(companyId!, payload),
    onSuccess: () => {
      invalidate();
      setDrawerOpen(false);
      setEditing(null);
      setMessage("规则已创建");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateScheduledPlaybookPayload }) =>
      updateScheduledPlaybook(companyId!, id, payload),
    onSuccess: () => {
      invalidate();
      setDrawerOpen(false);
      setEditing(null);
      setMessage("已保存");
    },
  });

  const handleSubmit = (payload: CreateScheduledPlaybookPayload) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleToggle = async (item: ScheduledPlaybookViewModel, enabled: boolean) => {
    setBusyId(item.id);
    try {
      await updateScheduledPlaybook(companyId!, item.id, { enabled });
      invalidate();
      setMessage(enabled ? "已启用" : "已暂停");
    } finally {
      setBusyId(null);
    }
  };

  const handleRunNow = async (item: ScheduledPlaybookViewModel) => {
    setBusyId(item.id);
    try {
      const result = await triggerScheduledPlaybookNow(companyId!, item.id);
      setMessage(result.enqueued ? "已触发执行" : "本次未入队（可能已运行过）");
      invalidate();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: ScheduledPlaybookViewModel) => {
    if (!window.confirm(`确定删除「${item.name}」？`)) return;
    setBusyId(item.id);
    try {
      await deleteScheduledPlaybook(companyId!, item.id);
      if (selectedId === item.id) setSelectedId(null);
      invalidate();
      setMessage("已删除");
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  return (
    <section className="h-full space-y-6 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">定时 Playbook</h1>
          <p className="mt-1 text-sm text-gray-500">按周期自动创建并执行 Agent 任务</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => schedulesQuery.refetch()}
            disabled={schedulesQuery.isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${schedulesQuery.isFetching ? "animate-spin" : ""}`} />
            刷新
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e]"
          >
            <Plus className="h-4 w-4" />
            新建规则
          </button>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-gray-200 bg-[#f8f9fa] px-4 py-2.5 text-xs text-gray-700">
          {message}
        </div>
      ) : null}

      {schedulesQuery.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-gray-400" />
          加载失败，请稍后重试
        </div>
      ) : null}

      <ScheduleStatCards stats={stats} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">规则列表</h2>
            {!schedulesQuery.isLoading ? (
              <span className="text-xs text-gray-400">{items.length} 条</span>
            ) : null}
          </div>
          {schedulesQuery.isLoading ? (
            <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
          ) : items.length ? (
            <ScheduleListTable
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleEnabled={handleToggle}
              onEdit={(item) => {
                setEditing(item);
                setDrawerOpen(true);
              }}
              onRunNow={handleRunNow}
              onDelete={handleDelete}
              busyId={busyId}
            />
          ) : (
            <ScheduleEmptyState onCreate={openCreate} />
          )}
        </div>
        <ScheduleDetailPanel item={selected} />
      </div>

      <p className="text-xs text-gray-400">
        公司级 Heartbeat 巡检请前往{" "}
        <Link to="/tasks/heartbeat" className="text-[#2d5a8e] hover:text-[#1e3a5f]">
          自治 Heartbeat
        </Link>
        。
      </p>

      <AnimatePresence>
        {drawerOpen ? (
          <ScheduleFormDrawer
            agents={agents}
            initial={editing}
            submitting={createMutation.isPending || updateMutation.isPending}
            onSubmit={handleSubmit}
            onClose={() => {
              setDrawerOpen(false);
              setEditing(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
