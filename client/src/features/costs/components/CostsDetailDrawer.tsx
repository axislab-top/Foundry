import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { fetchBillingRecords } from "../api/costsApi";
import type { AgentDailyDetailTarget } from "../types";
import {
  formatCredit,
  formatTokens,
  parseCredit,
  recordTypeLabel,
} from "../utils/formatCredit";

type Props = {
  target: AgentDailyDetailTarget | null;
  onClose: () => void;
};

export default function CostsDetailDrawer({ target, onClose }: Props) {
  const recordsQuery = useQuery({
    queryKey: ["costs-billing-records", target?.agentId, target?.usageDate],
    queryFn: () =>
      fetchBillingRecords({
        agentId: target!.agentId,
        usageDate: target!.usageDate,
      }),
    enabled: Boolean(target?.agentId && target?.usageDate),
    staleTime: 30_000,
  });

  const records = recordsQuery.data ?? [];
  const totalCost = records.reduce((s, r) => s + parseCredit(r.cost), 0);

  return (
    <AnimatePresence>
      {target ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.2 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">费用拆分</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {target.agentName} · {target.usageDate}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {recordsQuery.isLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                </div>
              ) : records.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">
                  该 Agent 当日暂无 billing 分项记录（可能尚未 flush 到财务账本）
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs text-gray-500">当日合计</p>
                    <p className="mt-1 text-lg font-bold text-gray-900">{formatCredit(totalCost)}</p>
                  </div>
                  {records.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-lg border border-gray-200 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          {recordTypeLabel(row.recordType)}
                        </span>
                        <span className="text-sm font-semibold text-red-700">
                          -{formatCredit(parseCredit(row.cost))}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-gray-500">
                        {row.modelName ? <p>模型：{row.modelName}</p> : null}
                        {(row.inputTokens > 0 || row.outputTokens > 0) && (
                          <p>Token：{formatTokens(row.inputTokens, row.outputTokens)}</p>
                        )}
                        {row.pricingSource ? <p>定价来源：{row.pricingSource}</p> : null}
                        {row.isNominal ? (
                          <p className="text-amber-600">名义占位（不占预算）</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
