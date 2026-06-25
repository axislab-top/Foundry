import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileCheck,
  AlertTriangle,
  MessageSquare,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { isPhase3FrontendEnabled } from "@/shared/config/env";
import { usePhase3DevWire } from "@/features/collaboration/realtime/phase3DevWire";
import { fetchCompanyDashboardSummary, type CompanyDashboardSummary } from "@/features/dashboard/phase3-dashboard-api";
import {
  summaryCards,
  taskTrendData,
  agentTaskData,
  agentStatusData,
  type AgentStatus,
  type AgentStatusItem,
} from "@/features/dashboard/mockDashboardData";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileCheck,
  AlertTriangle,
  MessageSquare,
};

const statusConfig: Record<AgentStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  running: { label: "运行中", color: "text-green-600", bg: "bg-green-50", icon: Activity },
  idle: { label: "空闲", color: "text-gray-500", bg: "bg-gray-50", icon: Clock },
  error: { label: "异常", color: "text-red-600", bg: "bg-red-50", icon: XCircle },
};

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.bg} ${config.color}`}>
      <StatusIcon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function AgentStatusCard({ agent }: { agent: AgentStatusItem }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[14px] font-semibold text-gray-800">{agent.name}</h4>
        <AgentStatusBadge status={agent.status} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-gray-400" />
        今日执行 <span className="font-semibold text-gray-700">{agent.todayExecutions}</span> 次
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const phase3 = usePhase3DevWire();
  const showPhase3Cards = import.meta.env.DEV || isPhase3FrontendEnabled();
  const [summary, setSummary] = useState<CompanyDashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!showPhase3Cards) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await fetchCompanyDashboardSummary();
        if (!cancelled) {
          setSummary(s);
          setSummaryError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setSummary(null);
          setSummaryError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPhase3Cards]);

  const p3 = summary?.phase3;

  return (
    <section className="h-full space-y-6 overflow-auto p-4 md:p-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">仪表盘</h2>
        <p className="mt-1 text-sm text-gray-500">Dashboard · 公司运营全景概览</p>
      </div>

      {/* 待办摘要卡片 */}
      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((card, index) => {
          const Icon = iconMap[card.icon];
          return (
            <motion.button
              key={card.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              onClick={() => navigate(card.linkTo)}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-gray-300"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                {Icon ? <Icon className="h-5 w-5 text-blue-600" /> : null}
              </div>
              <div>
                <p className="text-[13px] text-gray-500">{card.title}</p>
                <p className="mt-0.5 text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-[11px] text-gray-400">{card.titleEn}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* 图表区域 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 折线图：最近 7 天任务完成趋势 */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.15 }}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-[14px] font-semibold text-gray-800">任务完成趋势</h3>
          <p className="text-[11px] text-gray-400">Task Completion Trend · 最近 7 天</p>
          <div className="mt-4 h-[260px] min-h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={260} minWidth={0}>
              <LineChart data={taskTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="已完成"
                  stroke="#1e3a5f"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#1e3a5f" }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  name="失败"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#ef4444" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 柱状图：各 Agent 本周执行任务数量 */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.2 }}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-[14px] font-semibold text-gray-800">Agent 任务分布</h3>
          <p className="text-[11px] text-gray-400">Agent Task Distribution · 本周</p>
          <div className="mt-4 h-[260px] min-h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={260} minWidth={0}>
              <BarChart data={agentTaskData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Bar
                  dataKey="tasks"
                  name="执行任务数"
                  fill="#2d5a8e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Agent 运行状态 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.25 }}
      >
        <div className="mb-3">
          <h3 className="text-[14px] font-semibold text-gray-800">Agent 运行状态</h3>
          <p className="text-[11px] text-gray-400">Agent Running Status · 实时概览</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agentStatusData.map((agent, index) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.3 + index * 0.05 }}
            >
              <AgentStatusCard agent={agent} />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Phase 3 观测 */}
      {showPhase3Cards ? (
        <div className="space-y-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-4">
          <h3 className="text-sm font-semibold text-gray-800">Phase 3 观测（GET /v1/dashboard）</h3>
          <p className="text-xs text-gray-600">
            下列卡片读取网关 `dashboard.companySummary` 返回的 `phase3` 与 `costAwareMetrics`；需已登录并选择公司（`x-company-id`）。
          </p>
          {summaryError ? (
            <p className="text-xs text-red-600">加载失败：{summaryError}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-gray-200 bg-white p-3 text-xs shadow-sm">
              <div className="font-medium text-gray-800">costAwareMetrics</div>
              <div className="mt-1 font-mono text-gray-600">
                enabled={String(summary?.costAwareMetrics?.enabled ?? "—")} · approx=
                {summary?.costAwareMetrics?.tokenSavingsRateApprox ?? "—"}
              </div>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3 text-xs shadow-sm">
              <div className="font-medium text-gray-800">phase3.rollout</div>
              <div className="mt-1 font-mono text-gray-600">
                master={String(p3?.rollout.masterEnabled ?? "—")} cohort=
                {String(p3?.rollout.cohortMember ?? "—")} pct={p3?.rollout.percent ?? "—"}
              </div>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-3 text-xs shadow-sm">
              <div className="font-medium text-gray-800">phase3Status（WS 桩）</div>
              <div className="mt-1 font-mono text-gray-600">
                last: {phase3.lastEvent ?? "—"}
                {phase3.lastAt ? <span className="block text-[10px] text-gray-400">{phase3.lastAt}</span> : null}
              </div>
            </div>
          </div>
          {p3?.memoryGraph ? (
            <div className="rounded-md border border-gray-200 bg-white p-3 text-xs shadow-sm">
              <div className="font-medium text-gray-800">memoryGraph</div>
              <div className="mt-1 font-mono text-gray-600">
                process={String(p3.memoryGraph.processEnabled)} effective=
                {String(p3.memoryGraph.effectiveForCompany)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
