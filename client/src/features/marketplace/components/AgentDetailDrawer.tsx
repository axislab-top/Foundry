import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { MarketplaceAgentPreset } from "@/features/organization/types/api";
import {
  getAgentCategoryLabel,
  getDisplayCategory,
  getPriceLabel,
} from "../utils/viewModel";
import MarketplaceAgentAvatar from "./MarketplaceAgentAvatar";

type Props = {
  agent: MarketplaceAgentPreset;
  loadingDetail?: boolean;
  isRecruited: boolean;
  onClose: () => void;
  onRecruit: (agent: MarketplaceAgentPreset) => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-3 last:border-0">
      <dt className="shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className="text-right text-sm text-gray-800">{value}</dd>
    </div>
  );
}

export default function AgentDetailDrawer({
  agent,
  loadingDetail,
  isRecruited,
  onClose,
  onRecruit,
}: Props) {
  const displayCategory = getDisplayCategory(agent);
  const capabilities = agent.skillTags.length > 0 ? agent.skillTags : agent.departmentRoles;
  const priceLabel = getPriceLabel(agent);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <motion.div
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">商品详情</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex gap-4">
            <MarketplaceAgentAvatar preset={agent} size="lg" />
            <div className="min-w-0">
              <h4 className="text-lg font-semibold text-gray-900">{agent.name}</h4>
              <p className="mt-1 text-xs text-gray-500">
                {displayCategory} · {getAgentCategoryLabel(agent.agentCategory)}
              </p>
              {agent.rating != null ? (
                <p className="mt-1 text-xs text-gray-400">评分 {agent.rating.toFixed(1)}</p>
              ) : null}
            </div>
          </div>

          {loadingDetail ? <p className="mt-4 text-xs text-gray-400">加载详情…</p> : null}

          <div className="mt-5">
            <p className="text-xs font-medium text-gray-500">介绍</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">
              {agent.description ?? agent.expertise ?? "暂无详细介绍"}
            </p>
          </div>

          {capabilities.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs font-medium text-gray-500">技能与适配</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-md border border-gray-200 bg-[#f8f9fa] px-2 py-1 text-xs text-gray-600"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <dl className="mt-5 rounded-lg border border-gray-200 px-4">
            <DetailRow label="岗位类型" value={getAgentCategoryLabel(agent.agentCategory)} />
            <DetailRow label="底层模型" value={agent.boundModelName ?? "默认模型"} />
            <DetailRow label="定价" value={priceLabel ?? "—"} />
            <DetailRow label="累计使用" value={`${agent.usageCount.toLocaleString()} 次`} />
          </dl>
        </div>

        <div className="border-t border-gray-200 px-5 py-4">
          {isRecruited ? (
            <p className="text-center text-sm text-gray-500">该 Agent 已在团队中</p>
          ) : (
            <button
              type="button"
              onClick={() => onRecruit(agent)}
              className="w-full rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2d5a8e]"
            >
              招募 {agent.name}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
