import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  ArrowUpDown,
  TrendingDown,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useCompanyStore } from "@/shared/store/companyStore";
import { useRiskMonitorPage } from "./hooks/useRiskMonitorPage";
import type { RiskItem, RiskLevel, RiskStatus } from "./types";

/* ─── 配置 ─── */

const LEVEL_CONFIG: Record<
  RiskLevel,
  { label: string; icon: typeof AlertTriangle; color: string; bg: string; border: string; dot: string }
> = {
  high: {
    label: "高危",
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    dot: "bg-red-500",
  },
  medium: {
    label: "中危",
    icon: AlertCircle,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    dot: "bg-yellow-500",
  },
  low: {
    label: "低危",
    icon: Info,
    color: "text-gray-500",
    bg: "bg-gray-50",
    border: "border-gray-200",
    dot: "bg-gray-400",
  },
};

const STATUS_CONFIG: Record<RiskStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "待处理", color: "text-red-600", bg: "bg-red-50 border-red-200" },
  resolved: { label: "已解决", color: "text-green-600", bg: "bg-green-50 border-green-200" },
};

const ALL_LEVELS: RiskLevel[] = ["high", "medium", "low"];
const ALL_STATUSES: RiskStatus[] = ["pending", "resolved"];

/* ─── Recharts Tooltip ─── */

interface TooltipPayloadItem {
  name: string;
  value: number;
  color?: string;
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name === "high" ? "高危" : "中危"}：{entry.value} 次
        </p>
      ))}
    </div>
  );
}

/* ─── 主页面 ─── */

export default function RiskMonitorPage() {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  if (!companyId) {
    return (
      <section className="flex flex-col items-center justify-center gap-2 py-20 text-gray-500">
        <ShieldCheck className="h-8 w-8 text-gray-300" />
        <p className="text-sm">请先选择或创建公司</p>
      </section>
    );
  }

  return <RiskMonitorPageContent key={companyId} companyId={companyId} />;
}

function RiskMonitorPageContent({ companyId }: { companyId: string }) {
  const {
    loading,
    hasError,
    resolveError,
    resolving,
    refetch,
    stats,
    trendData,
    filteredRisks,
    levelFilter,
    setLevelFilter,
    statusFilter,
    setStatusFilter,
    sortAsc,
    setSortAsc,
    processingRisk,
    setProcessingRisk,
    processNote,
    setProcessNote,
    handleResolve,
  } = useRiskMonitorPage(companyId);

  if (loading) {
    return (
      <section className="flex flex-col items-center justify-center gap-2 py-20 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
        <p className="text-sm">加载风险数据…</p>
      </section>
    );
  }

  if (hasError) {
    return (
      <section className="flex flex-col items-center justify-center gap-3 py-20 text-gray-500">
        <AlertTriangle className="h-8 w-8 text-red-300" />
        <p className="text-sm">加载风险数据失败</p>
        <button
          type="button"
          onClick={refetch}
          className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-xs font-medium text-white hover:bg-[#2d5a8e]"
        >
          重试
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">风险监控</h2>
            <p className="mt-0.5 text-xs text-gray-500">Risk Monitor — 检测和预警公司运营中的异常情况</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <ShieldCheck className="h-4 w-4" />
            实时监控中
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-orange-500" /><span className="text-xs text-gray-500">当前活跃风险</span></div>
          <p className="mt-2 text-xl font-bold text-gray-900">{stats.activeCount}</p>
          <p className="mt-1 text-[11px] text-gray-400">待处理</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.04 }} className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" /><span className="text-xs text-red-500">高危风险</span></div>
          <p className="mt-2 text-xl font-bold text-red-600">{stats.highCount}</p>
          <p className="mt-1 text-[11px] text-red-400">需要立即关注</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.08 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-500" /><span className="text-xs text-gray-500">本周已处理</span></div>
          <p className="mt-2 text-xl font-bold text-gray-900">{stats.resolvedThisWeek}</p>
          <p className="mt-1 text-[11px] text-gray-400">风险已解决</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.12 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><TrendingDown className="h-5 w-5 text-emerald-500" /><span className="text-xs text-gray-500">风险解决率</span></div>
          <p className="mt-2 text-xl font-bold text-emerald-600">{stats.resolveRate}%</p>
          <p className="mt-1 text-[11px] text-gray-400">总体解决率</p>
        </motion.div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">等级</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setLevelFilter("")} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${levelFilter === "" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>全部</button>
              {ALL_LEVELS.map((l) => (
                <button key={l} type="button" onClick={() => setLevelFilter(levelFilter === l ? "" : l)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${levelFilter === l ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{LEVEL_CONFIG[l].label}</button>
              ))}
            </div>
          </div>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">状态</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setStatusFilter("")} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${statusFilter === "" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>全部</button>
              {ALL_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setStatusFilter(statusFilter === s ? "" : s)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${statusFilter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{STATUS_CONFIG[s].label}</button>
              ))}
            </div>
          </div>
          <div className="h-5 w-px bg-gray-200" />
          <button type="button" onClick={() => setSortAsc((p) => !p)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100">
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortAsc ? "时间升序" : "时间降序"}
          </button>
          <span className="ml-auto text-xs text-gray-400">{filteredRisks.length} 条风险</span>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <h3 className="mb-3 text-xs font-semibold text-gray-700">最近 14 天风险趋势</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <ReTooltip content={<TrendTooltip />} />
              <Legend verticalAlign="top" height={0} />
              <Line type="monotone" dataKey="high" stroke="#ef4444" strokeWidth={2} dot={false} name="高危" />
              <Line type="monotone" dataKey="medium" stroke="#f59e0b" strokeWidth={2} dot={false} name="中危" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        {filteredRisks.map((risk, index) => {
          const levelCfg = LEVEL_CONFIG[risk.level];
          const statusCfg = STATUS_CONFIG[risk.status];
          const LevelIcon = levelCfg.icon;
          return (
            <motion.div
              key={risk.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${levelCfg.bg}`}>
                  <LevelIcon className={`h-4 w-4 ${levelCfg.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">{risk.title}</h4>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {risk.source} · {risk.triggeredAt}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      {risk.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={() => setProcessingRisk(risk)}
                          className="rounded-lg bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2d5a8e]"
                        >
                          处理
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-500">{risk.description}</p>
                </div>
              </div>
            </motion.div>
          );
        })}

        {filteredRisks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ShieldCheck className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium">暂无匹配的风险记录</p>
            <p className="mt-1 text-xs">尝试调整筛选条件</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {processingRisk && (
          <ProcessModal
            risk={processingRisk}
            note={processNote}
            resolveError={resolveError}
            resolving={resolving}
            onNoteChange={setProcessNote}
            onConfirm={handleResolve}
            onCancel={() => {
              setProcessingRisk(null);
              setProcessNote("");
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function ProcessModal({
  risk,
  note,
  resolveError,
  resolving,
  onNoteChange,
  onConfirm,
  onCancel,
}: {
  risk: RiskItem;
  note: string;
  resolveError: boolean;
  resolving: boolean;
  onNoteChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const levelCfg = LEVEL_CONFIG[risk.level];
  const LevelIcon = levelCfg.icon;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onCancel}
      />
      <motion.div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${levelCfg.bg}`}>
            <LevelIcon className={`h-5 w-5 ${levelCfg.color}`} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">处理风险</h3>
            <p className="text-xs text-gray-500">{risk.title}</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-600">{risk.description}</p>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">处理备注</label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            placeholder="输入处理措施或备注..."
            className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
          />
        </div>

        {resolveError ? (
          <p className="mt-3 text-xs text-red-600">标记失败，请稍后重试。</p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} disabled={resolving} className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">取消</button>
          <button type="button" onClick={onConfirm} disabled={resolving} className="flex-1 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e] disabled:opacity-50">
            {resolving ? "提交中…" : "标记为已解决"}
          </button>
        </div>
      </motion.div>
    </>
  );
}
