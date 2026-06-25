import { motion } from "framer-motion";
import { Filter, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { AgentDailyRow } from "../types";
import type { ApiAgent } from "@/features/organization/types/api";
import {
  formatCredit,
  formatTokens,
  formatUsageDate,
  parseCredit,
} from "../utils/formatCredit";
import CostsEmptyState from "./CostsEmptyState";

const PAGE_SIZE = 20;

type Props = {
  rows: AgentDailyRow[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  agentFilter: string;
  onAgentFilterChange: (agentId: string) => void;
  agents: ApiAgent[];
  loading?: boolean;
  onViewDetail: (row: AgentDailyRow) => void;
};

export default function CostsDetailTable({
  rows,
  total,
  page,
  onPageChange,
  agentFilter,
  onAgentFilterChange,
  agents,
  loading,
  onViewDetail,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.1 }}
      className="flex min-h-0 flex-1 flex-col rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">费用明细</h3>
          <p className="text-[11px] text-gray-400">每 Agent 每日一条 · 基于 daily_agent_usage</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Filter className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <select
              value={agentFilter}
              onChange={(e) => onAgentFilterChange(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-7 text-xs text-gray-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
            >
              <option value="">全部 Agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <span className="text-xs text-gray-400">共 {total} 条</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : rows.length === 0 ? (
          <CostsEmptyState />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className="px-5 py-2.5">日期</th>
                <th className="px-5 py-2.5">Agent</th>
                <th className="px-5 py-2.5">部门</th>
                <th className="px-5 py-2.5">主模型</th>
                <th className="px-5 py-2.5 text-right">输入/输出 Token</th>
                <th className="px-5 py-2.5 text-right">调用次数</th>
                <th className="px-5 py-2.5 text-right">费用</th>
                <th className="px-5 py-2.5 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-gray-50 transition-colors hover:bg-gray-50/50"
                >
                  <td className="whitespace-nowrap px-5 py-2.5 text-xs text-gray-500">
                    {formatUsageDate(record.usageDate)}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-sm font-medium text-gray-800">{record.agentName}</span>
                  </td>
                  <td className="px-5 py-2.5 text-sm text-gray-600">
                    {record.departmentName ?? "—"}
                  </td>
                  <td className="px-5 py-2.5 text-sm text-gray-600">{record.llmModel ?? "—"}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right text-xs text-gray-600">
                    {formatTokens(record.inputTokens, record.outputTokens)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right text-xs text-gray-600">
                    {record.callCount.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right text-sm font-medium text-gray-800">
                    {formatCredit(parseCredit(record.totalCost))}
                  </td>
                  <td className="px-5 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => onViewDetail(record)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      查看拆分
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-5 py-2.5">
          <span className="text-xs text-gray-400">
            第 {page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-600 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

export { PAGE_SIZE };
