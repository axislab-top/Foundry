import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  FileCheck,
  ListTodo,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Clock,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useDailyBrief } from "@/features/daily-brief/useDailyBrief";
import type { DailyBriefKeyMetric, DailyBriefPendingItem } from "@/features/daily-brief/daily-brief-types";
import { useOnboardingStepOnVisit } from "@/features/onboarding";

const priorityStyles: Record<string, string> = {
  高: "bg-red-50 text-red-600",
  中: "bg-amber-50 text-amber-600",
  低: "bg-gray-100 text-gray-500",
};

const metricIconMap: Record<DailyBriefKeyMetric["iconKey"], React.ComponentType<{ className?: string }>> = {
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Clock,
};

const sourceIconMap: Record<DailyBriefPendingItem["icon"], React.ComponentType<{ className?: string }>> = {
  FileCheck,
  ListTodo,
  MessageSquare,
};

function Greeting({ userName }: { userName: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const greetingEn = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const dateEn = today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-end justify-between"
    >
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{greeting}，{userName}</h2>
        <p className="mt-1 text-sm text-gray-500">{greetingEn}</p>
      </div>
      <div className="text-right">
        <p className="text-[14px] font-medium text-gray-700">{dateStr}</p>
        <p className="text-[12px] text-gray-400">{dateEn}</p>
      </div>
    </motion.div>
  );
}

function YesterdaySummary({ text, sourceLabel }: { text: string; sourceLabel: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.05 }}
      className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
          <Sparkles className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-gray-800">昨日工作摘要</h3>
          <p className="text-[11px] text-gray-400">{sourceLabel}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-gray-600">{text}</p>
        </div>
      </div>
    </motion.div>
  );
}

function PendingList({ items }: { items: DailyBriefPendingItem[] }) {
  const navigate = useNavigate();
  const grouped = useMemo(() => {
    const map: Record<string, DailyBriefPendingItem[]> = {};
    for (const item of items) {
      if (!map[item.source]) map[item.source] = [];
      map[item.source].push(item);
    }
    return map;
  }, [items]);

  const sourceOrder = ["审批", "任务", "消息"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.1 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-[14px] font-semibold text-gray-800">今日待处理</h3>
      <p className="text-[11px] text-gray-400">Pending Items · 审批 / 任务 / 消息</p>

      {items.length === 0 ? (
        <p className="mt-4 text-[13px] text-gray-500">暂无待处理事项，可以专注推进新目标。</p>
      ) : (
        <div className="mt-4 space-y-5">
          {sourceOrder.map((source) => {
            const groupItems = grouped[source];
            if (!groupItems?.length) return null;
            const SourceIcon = sourceIconMap[groupItems[0].icon];
            return (
              <div key={source}>
                <div className="mb-2 flex items-center gap-1.5">
                  {SourceIcon ? <SourceIcon className="h-3.5 w-3.5 text-gray-400" /> : null}
                  <span className="text-[12px] font-semibold text-gray-500">{source}</span>
                </div>
                <div className="space-y-1.5">
                  {groupItems.map((item, index) => {
                    const ItemIcon = sourceIconMap[item.icon];
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: 0.15 + index * 0.03 }}
                        onClick={() => navigate(item.linkTo)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                      >
                        {ItemIcon ? <ItemIcon className="h-4 w-4 shrink-0 text-gray-400" /> : null}
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-700">{item.title}</span>
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{item.tag}</span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityStyles[item.priority] ?? priorityStyles["低"]}`}>
                          {item.priority}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function KeyNumbers({ metrics }: { metrics: DailyBriefKeyMetric[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.15 }}
    >
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold text-gray-800">关键数字</h3>
        <p className="text-[11px] text-gray-400">Key Metrics · 昨日概览</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((item, index) => {
          const Icon = metricIconMap[item.iconKey];
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.2 + index * 0.05 }}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                  <Icon className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-[12px] text-gray-500">{item.label}</p>
                  <p className="text-[10px] text-gray-400">{item.labelEn}</p>
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold text-gray-900">
                {item.value}
                {item.suffix ? <span className="ml-0.5 text-sm font-medium text-gray-400">{item.suffix}</span> : null}
              </p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <section className="animate-pulse space-y-6">
      <div className="h-16 rounded-xl bg-gray-100" />
      <div className="h-32 rounded-xl bg-gray-100" />
      <div className="h-48 rounded-xl bg-gray-100" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-24 rounded-xl bg-gray-100" />
        ))}
      </div>
    </section>
  );
}

export default function DailyBriefPage() {
  useOnboardingStepOnVisit("task_daily_brief");
  const { data, isLoading, isError, refetch, isFetching } = useDailyBrief();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError || !data) {
    return (
      <section className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-100 bg-red-50 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-[14px] text-red-700">今日快报加载失败，请稍后重试。</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          重试
        </button>
      </section>
    );
  }

  return (
    <section className="h-full space-y-6 overflow-auto p-4 md:p-6">
      <Greeting userName={data.userName} />
      <YesterdaySummary text={data.yesterdaySummary.text} sourceLabel={data.yesterdaySummary.sourceLabel} />
      <PendingList items={data.pendingItems} />
      <KeyNumbers metrics={data.keyMetrics} />
    </section>
  );
}
