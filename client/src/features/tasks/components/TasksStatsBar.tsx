import { motion } from "framer-motion";
import { Activity, CheckCircle2, Clock, AlertTriangle, Loader2, PauseCircle } from "lucide-react";
import type { TaskStats } from "../api/tasksTypes";

const cards = [
  { key: "total", label: "全部任务", icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
  { key: "inProgress", label: "进行中", icon: Loader2, color: "text-sky-600", bg: "bg-sky-50" },
  { key: "completed", label: "已完成", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  { key: "blocked", label: "阻塞", icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-50" },
  { key: "pending", label: "待启动", icon: Clock, color: "text-slate-500", bg: "bg-slate-50" },
  { key: "overdue", label: "已逾期", icon: PauseCircle, color: "text-orange-600", bg: "bg-orange-50" },
] as const;

export default function TasksStatsBar({ stats, loading }: { stats: TaskStats; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c, i) => {
        const Icon = c.icon;
        const value = stats[c.key];
        return (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <span className="text-xs font-medium text-gray-500">{c.label}</span>
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-gray-900">
              {loading ? "—" : value}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
