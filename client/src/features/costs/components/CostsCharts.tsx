import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { AgentDailyRow, CostTrendPoint } from "../types";
import { formatCredit, formatUsageDate, parseCredit } from "../utils/formatCredit";

const PIE_COLORS = ["#1e3a5f", "#2d5a8e", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"];

type Props = {
  agentDailyRows: AgentDailyRow[];
  trend: CostTrendPoint[];
  loading?: boolean;
};

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-gray-800">{d.name}</p>
      <p className="text-xs text-gray-500">{formatCredit(d.value ?? 0)}</p>
    </div>
  );
}

function LineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800">{formatCredit(payload[0].value ?? 0)}</p>
    </div>
  );
}

export default function CostsCharts({ agentDailyRows, trend, loading }: Props) {
  const agentCosts = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    for (const row of agentDailyRows) {
      const prev = map.get(row.agentId);
      const cost = parseCredit(row.totalCost);
      if (prev) {
        prev.value += cost;
      } else {
        map.set(row.agentId, { name: row.agentName, value: cost });
      }
    }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [agentDailyRows]);

  const lineData = useMemo(
    () =>
      trend.map((p) => ({
        date: formatUsageDate(p.date).replace(/^\d{4}\//, ""),
        cost: parseCredit(p.cost),
      })),
    [trend],
  );

  if (loading && agentCosts.length === 0 && lineData.length === 0) {
    return (
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="h-72 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        <div className="h-72 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h3 className="mb-4 text-sm font-semibold text-gray-800">各 Agent 费用占比</h3>
        {agentCosts.length === 0 ? (
          <p className="py-16 text-center text-xs text-gray-400">所选范围内暂无消费数据</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={agentCosts}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={2}
                >
                  {agentCosts.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {agentCosts.map((item, i) => {
                const total = agentCosts.reduce((s, a) => s + a.value, 0);
                const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                return (
                  <span key={item.name} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {item.name} {pct}%
                  </span>
                );
              })}
            </div>
          </>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h3 className="mb-4 text-sm font-semibold text-gray-800">每日费用趋势</h3>
        {lineData.length === 0 ? (
          <p className="py-16 text-center text-xs text-gray-400">暂无趋势数据</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}`}
              />
              <ReTooltip content={<LineTooltip />} />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#1e3a5f"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#1e3a5f" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </motion.div>
    </div>
  );
}
