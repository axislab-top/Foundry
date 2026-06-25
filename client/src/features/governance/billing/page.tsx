import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  BILLING_CREDIT_RATE_HINT,
  formatCredit,
  formatRmbFromCredit,
} from "@/features/costs/utils/formatCredit";
import { useCompanyStore } from "@/shared/store/companyStore";
import { useBillingPage } from "./hooks/useBillingPage";
import { CATEGORY_ICONS } from "./utils/billingTransform";

const PIE_COLORS = ["#1e3a5f", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"];

interface TooltipPayloadItem {
  name: string;
  value: number;
  color?: string;
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name === "income" ? "购额" : "消费"}：{formatCredit(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-gray-800">{d.name}</p>
      <p className="text-xs text-gray-500">{formatCredit(d.value ?? 0)}</p>
    </div>
  );
}

export default function BillingPage() {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);

  if (!companyId) {
    return (
      <section className="flex flex-col items-center justify-center gap-2 py-20 text-gray-500">
        <AlertCircle className="h-8 w-8 text-gray-300" />
        <p className="text-sm">请先选择或创建公司</p>
      </section>
    );
  }

  return <BillingPageContent key={companyId} companyId={companyId} />;
}

function BillingPageContent({ companyId }: { companyId: string }) {
  const {
    loading,
    typeFilter,
    setTypeFilter,
    monthFilter,
    setMonthFilter,
    monthOptions,
    totalIncome,
    totalExpense,
    netChange,
    budgetPercent,
    budgetRemaining,
    isOverBudget,
    monthlyChart,
    expenseCategories,
    filteredBills,
    hasError,
  } = useBillingPage(companyId);

  return (
    <section className="flex flex-col gap-4 pb-6">
      {/* 标题栏 */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-gray-900">预算与账单</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            账号 Credit 额度（注册赠送，名下所有公司共用）· 购额记录与消费明细（{BILLING_CREDIT_RATE_HINT}）
          </p>
        </div>
      </div>

      {hasError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          加载账单数据失败，请稍后重试。
        </div>
      )}

      {/* 财务概览卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <span className="text-xs text-gray-500">本月购额</span>
            {loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
          <p className="mt-2 text-xl font-bold text-green-600">{formatCredit(totalIncome)}</p>
          <p className="mt-1 text-[11px] text-gray-400">{formatRmbFromCredit(totalIncome)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.04 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            <span className="text-xs text-gray-500">本月消费</span>
            {loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
          <p className="mt-2 text-xl font-bold text-red-600">{formatCredit(totalExpense)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.08 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-gray-500">本月净变动</span>
            {loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
          <p className={`mt-2 text-xl font-bold ${netChange >= 0 ? "text-green-600" : "text-red-600"}`}>
            {netChange >= 0 ? "+" : ""}
            {formatCredit(netChange)}
          </p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.12 }} className={`rounded-xl border p-5 shadow-sm ${isOverBudget ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
          <div className="flex items-center gap-2">
            <PiggyBank className={`h-5 w-5 ${isOverBudget ? "text-red-500" : "text-amber-500"}`} />
            <span className="text-xs text-gray-500">账号额度使用</span>
            {loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
          <p className={`mt-2 text-xl font-bold ${isOverBudget ? "text-red-600" : "text-gray-900"}`}>{budgetPercent}%</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full transition-all ${isOverBudget ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, budgetPercent)}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            {isOverBudget
              ? `超出额度 ${formatCredit(Math.abs(budgetRemaining))}`
              : `剩余 ${formatCredit(budgetRemaining)}`}
          </p>
        </motion.div>
      </div>

      {/* 图表区域 */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">最近 6 个月购额与消费对比</h3>
          {loading ? (
            <div className="flex h-[220px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(v >= 1000 ? 0 : 1)}k`} />
                <ReTooltip content={<BarTooltip />} />
                <Legend verticalAlign="top" height={0} />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="income" />
                <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} name="expense" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.15 }} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">本月消费分类</h3>
          {loading ? (
            <div className="flex h-[180px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : expenseCategories.length === 0 ? (
            <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">暂无消费数据</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={expenseCategories} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" nameKey="name" paddingAngle={2}>
                    {expenseCategories.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
                {expenseCategories.map((cat, i) => (
                  <span key={cat.name} className="flex items-center gap-1 text-[11px] text-gray-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {cat.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* 筛选栏 */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">类型</span>
            <div className="flex gap-1">
              {[
                { key: "" as const, label: "全部" },
                { key: "income" as const, label: "购额" },
                { key: "expense" as const, label: "消费" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTypeFilter(opt.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${typeFilter === opt.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">月份</span>
            <div className="flex flex-wrap gap-1">
              {monthOptions.map((opt) => (
                <button
                  key={opt.key || "all"}
                  type="button"
                  onClick={() => setMonthFilter(opt.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${monthFilter === opt.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <span className="ml-auto text-xs text-gray-400">{filteredBills.length} 条记录</span>
        </div>
      </div>

      {/* 账单明细列表 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-5 py-2.5">
          <div className="grid grid-cols-[100px_50px_1fr_140px_100px_80px] gap-3 text-[11px] font-medium uppercase tracking-wider text-gray-400">
            <span>日期</span>
            <span>类型</span>
            <span>描述</span>
            <span className="text-right">金额</span>
            <span>分类</span>
            <span className="text-center">状态</span>
          </div>
        </div>
        <div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
            </div>
          ) : (
            filteredBills.map((bill, index) => (
              <motion.div
                key={bill.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, delay: index * 0.02 }}
                className="border-b border-gray-50 px-5 py-3 transition-colors hover:bg-gray-50/50"
              >
                <div className="grid grid-cols-[100px_50px_1fr_140px_100px_80px] items-center gap-3">
                  <span className="text-xs text-gray-500">{bill.date}</span>
                  <span>
                    {bill.type === "income" ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                  </span>
                  <span className="truncate text-sm text-gray-700">{bill.description}</span>
                  <span className={`text-right text-sm font-medium ${bill.type === "income" ? "text-green-600" : "text-red-600"}`}>
                    {bill.type === "income" ? "+" : ""}
                    {formatCredit(Math.abs(bill.amount))}
                  </span>
                  <span className="truncate text-xs text-gray-500">
                    {CATEGORY_ICONS[bill.category] ? `${CATEGORY_ICONS[bill.category]} ` : ""}
                    {bill.category}
                  </span>
                  <span className="text-center">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${bill.status === "settled" ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-600"}`}>
                      {bill.status === "settled" ? "已结算" : "待结算"}
                    </span>
                  </span>
                </div>
              </motion.div>
            ))
          )}
          {!loading && filteredBills.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <DollarSign className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium">暂无匹配的账单记录</p>
            </div>
          )}
        </div>
      </div>

    </section>
  );
}
