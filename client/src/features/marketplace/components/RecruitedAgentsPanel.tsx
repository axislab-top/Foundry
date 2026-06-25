import { Link } from "react-router-dom";
import type { MarketplaceAgentPreset } from "@/features/organization/types/api";
import MarketplaceAgentAvatar from "./MarketplaceAgentAvatar";

export type RecruitedAgentRow = {
  marketplaceId: string;
  agentId: string;
  name: string;
  departmentName: string;
  preset: MarketplaceAgentPreset | null;
};

export default function RecruitedAgentsPanel({ items }: { items: RecruitedAgentRow[] }) {
  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">已招募</h2>
        <p className="mt-0.5 text-xs text-gray-400">{items.length} 名 Agent 已在团队中</p>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map((agent) => (
          <Link
            key={agent.agentId}
            to="/organization"
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
          >
            {agent.preset ? (
              <MarketplaceAgentAvatar preset={agent.preset} size="sm" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-[#f8f9fa] text-xs font-semibold text-gray-500">
                {agent.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{agent.name}</p>
              <p className="truncate text-xs text-gray-500">{agent.departmentName}</p>
            </div>
            <span className="shrink-0 text-xs text-[#2d5a8e]">组织树 →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
