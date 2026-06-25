import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  User,
  Zap,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchAgents } from "@/features/organization/api/organizationApi";
import { organizationKeys } from "@/features/organization/api/queryKeys";
import { useCompanyStore } from "@/shared/store/companyStore";
import { getExecutionLogsByRunId, listAllTaskRuns, listAllTasks, listTaskRuns } from "../api/tasksApi";
import { executionLogsKeys } from "./queryKeys";
import {
  buildTodayStats,
  buildTrendData,
  runToRecord,
  type ExecutionRecord,
  type ExecutionStatus,
  type TriggerType,
} from "./executionLogsModel";

/* ─── 状态配置 ─── */

const statusConfig: Record<ExecutionStatus, { label: string; labelEn: string; color: string; bgColor: string }> = {
  success: { label: "成功", labelEn: "Success", color: "text-green-600", bgColor: "bg-green-50" },
  failed: { label: "失败", labelEn: "Failed", color: "text-red-600", bgColor: "bg-red-50" },
  running: { label: "执行中", labelEn: "Running", color: "text-blue-600", bgColor: "bg-blue-50" },
};

const triggerConfig: Record<TriggerType, { label: string; labelEn: string }> = {
  auto: { label: "自动", labelEn: "Auto" },
  manual: { label: "手动", labelEn: "Manual" },
};

/* ─── 工具函数 ─── */

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${hours}:${mins}`;
}

/** Build page number array with -1 as ellipsis sentinel */
function buildPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: number[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push(-1);
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push(-1);
  pages.push(total);
  return pages;
}

/* ─── 主页面 ─── */

export default function ExecutionLogsPage() {
  const PAGE_SIZE = 20;
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "">("");
  const [triggerFilter, setTriggerFilter] = useState<TriggerType | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Reset filters & page when company changes
  useEffect(() => {
    setAgentFilter("");
    setStatusFilter("");
    setTriggerFilter("");
    setSearchQuery("");
    setExpandedRunId(null);
    setPage(1);
  }, [companyId]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [agentFilter, statusFilter, triggerFilter, searchQuery]);

  // Stats query — fetch a broader window for today's stats & trend chart
  const statsQuery = useQuery({
    queryKey: executionLogsKeys.taskRuns(companyId),
    queryFn: () => listAllTaskRuns({ limit: 100 }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  // Paginated list query
  const runsQuery = useQuery({
    queryKey: executionLogsKeys.taskRunsPage(companyId, page, PAGE_SIZE),
    queryFn: () => listTaskRuns({ page, limit: PAGE_SIZE }),
    enabled: Boolean(companyId),
    staleTime: 15_000,
  });

  const agentsQuery = useQuery({
    queryKey: organizationKeys.agents(companyId),
    queryFn: fetchAgents,
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const tasksQuery = useQuery({
    queryKey: organizationKeys.tasks(companyId),
    queryFn: () => listAllTasks(),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const expandedLogsQuery = useQuery({
    queryKey: executionLogsKeys.runLogs(companyId, expandedRunId ?? undefined),
    queryFn: () => getExecutionLogsByRunId(expandedRunId!),
    enabled: Boolean(companyId && expandedRunId),
    staleTime: 10_000,
  });

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agentsQuery.data ?? []) {
      if (a.id) map.set(a.id, a.name || a.role || a.id);
    }
    return map;
  }, [agentsQuery.data]);

  const taskTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasksQuery.data ?? []) {
      if (t.id && t.title) map.set(t.id, t.title);
    }
    return map;
  }, [tasksQuery.data]);

  const pageItems = runsQuery.data?.items ?? [];
  const totalItems = runsQuery.data?.total ?? 0;
  const totalPages = runsQuery.data?.totalPages ?? Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const records = useMemo(() => {
    return pageItems.map((run) =>
      runToRecord(
        run,
        agentNameById,
        taskTitleById,
        expandedRunId === run.id ? (expandedLogsQuery.data ?? []) : [],
      ),
    );
  }, [pageItems, agentNameById, taskTitleById, expandedRunId, expandedLogsQuery.data]);

  const agentOptions = useMemo(() => {
    const names = new Set<string>();
    const allRuns = statsQuery.data ?? [];
    for (const run of allRuns) {
      const { agentId } = (() => {
        const md = run.metadata ?? {};
        return { agentId: run.linkedAgentId ?? (md.agentId as string | undefined) ?? null };
      })();
      if (agentId) {
        const name = agentNameById.get(agentId);
        if (name) names.add(name);
      }
    }
    for (const a of agentsQuery.data ?? []) {
      if (a.name) names.add(a.name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [statsQuery.data, agentNameById, agentsQuery.data]);

  const stats = useMemo(() => buildTodayStats(statsQuery.data ?? []), [statsQuery.data]);
  const trendData = useMemo(() => buildTrendData(statsQuery.data ?? []), [statsQuery.data]);

  const isLoading = runsQuery.isLoading;
  const isError = runsQuery.isError;
  const isEmpty = !isLoading && !isError && totalItems === 0;

  return (
    <section className="h-full space-y-6 overflow-auto p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">执行日志</h1>
          <p className="mt-1 text-sm text-gray-500">
            Execution Logs — 记录所有 Agent 执行任务的详细过程
          </p>
        </div>
        <button
          type="button"
          onClick={() => { statsQuery.refetch(); runsQuery.refetch(); }}
          disabled={statsQuery.isFetching || runsQuery.isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {statsQuery.isFetching || runsQuery.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新
        </button>
      </div>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          加载执行记录失败，请确认已登录且 API 服务可用后重试。
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="h-5 w-5 text-gray-500" />}
          label="今日执行"
          labelEn="Today"
          value={statsQuery.isLoading ? "—" : stats.total}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
          label="成功"
          labelEn="Success"
          value={statsQuery.isLoading ? "—" : stats.success}
          valueColor="text-green-600"
        />
        <StatCard
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          label="失败"
          labelEn="Failed"
          value={statsQuery.isLoading ? "—" : stats.failed}
          valueColor="text-red-600"
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-blue-500" />}
          label="平均耗时"
          labelEn="Avg Duration"
          value={statsQuery.isLoading ? "—" : formatDuration(stats.avgDuration)}
          valueColor="text-blue-600"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">最近 7 天执行趋势</h3>
        {statsQuery.isLoading ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : (
          <div className="h-[200px] min-h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={200} minWidth={0}>
              <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} />
              <ReTooltip content={<TrendTooltip />} />
              <Area type="monotone" dataKey="success" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
              <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索运行 ID、任务名称、Agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">全部 Agent</option>
          {agentOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ExecutionStatus | "")}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="running">执行中</option>
        </select>
        <select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value as TriggerType | "")}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">全部触发方式</option>
          <option value="auto">自动</option>
          <option value="manual">手动</option>
        </select>
      </div>

      <div className="space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-12 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载执行记录…
          </div>
        )}
        {!isLoading &&
          records.map((record) => (
            <ExecutionRow
              key={record.runId}
              record={record}
              isExpanded={expandedRunId === record.runId}
              stepsLoading={expandedRunId === record.runId && expandedLogsQuery.isLoading}
              onToggle={() =>
                setExpandedRunId((prev) => (prev === record.runId ? null : record.runId))
              }
            />
          ))}
        {!isLoading && !isError && records.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
            {isEmpty ? "暂无执行记录" : "无匹配的执行记录"}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && !isError && totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-500">
            共 {totalItems} 条记录，第 {page}/{totalPages} 页
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
              aria-label="首页"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
              aria-label="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {buildPageNumbers(page, totalPages).map((p, i) =>
              p === -1 ? (
                <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`flex h-8 min-w-[2rem] items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                    p === page
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
              aria-label="下一页"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
              aria-label="末页"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── 统计卡片 ─── */

function StatCard({
  icon,
  label,
  labelEn,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  labelEn: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <motion.div
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${valueColor ?? "text-gray-900"}`}>{value}</p>
      <p className="text-[11px] text-gray-400">{labelEn}</p>
    </motion.div>
  );
}

interface TrendPayloadItem {
  name: string;
  value: number;
  color?: string;
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TrendPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name === "success" ? "成功" : "失败"}：{entry.value} 次
        </p>
      ))}
    </div>
  );
}

function ExecutionRow({
  record,
  isExpanded,
  stepsLoading,
  onToggle,
}: {
  record: ExecutionRecord;
  isExpanded: boolean;
  stepsLoading: boolean;
  onToggle: () => void;
}) {
  const status = statusConfig[record.status];
  const trigger = triggerConfig[record.trigger];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="w-20 shrink-0 font-mono text-xs text-gray-400" title={record.runId}>
          {record.id}
        </span>
        <div className="flex w-32 shrink-0 items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white ${record.agentAvatar.color}`}
          >
            {record.agentAvatar.initials}
          </div>
          <span className="truncate text-sm text-gray-700">{record.agentName}</span>
        </div>
        <span className="flex-1 truncate text-sm text-gray-900">{record.taskName}</span>
        <span className="w-24 shrink-0 text-xs text-gray-500">{formatTime(record.startTime)}</span>
        <span className="w-16 shrink-0 text-xs text-gray-500">{formatDuration(record.duration)}</span>
        <span
          className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${status.color} ${status.bgColor}`}
        >
          {status.label}
        </span>
        <span className="w-12 shrink-0 text-center text-xs text-gray-500" title={trigger.label}>
          {record.trigger === "auto" ? (
            <Zap className="inline h-3.5 w-3.5 text-blue-400" />
          ) : (
            <User className="inline h-3.5 w-3.5 text-gray-400" />
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4">
              <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">执行步骤</h4>
              {stepsLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  加载步骤…
                </div>
              ) : record.steps.length === 0 ? (
                <p className="text-xs text-gray-400">该运行暂无步骤日志</p>
              ) : (
                <div className="space-y-2">
                  {record.steps.map((step) => (
                    <div
                      key={step.id}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                        {step.stepNumber}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">{step.description}</p>
                        <div className="mt-1 flex gap-4 text-xs text-gray-500">
                          <span>输入：{step.inputSummary}</span>
                          <span>输出：{step.outputSummary}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-gray-400">
                        {step.duration > 0 ? `${step.duration}s` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
