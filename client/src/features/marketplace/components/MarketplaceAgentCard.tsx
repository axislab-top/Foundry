import type { MarketplaceAgentPreset } from "@/features/organization/types/api";
import {
  getAgentCategoryLabel,
  getDisplayCategory,
  getPriceLabel,
} from "../utils/viewModel";
import MarketplaceAgentAvatar from "./MarketplaceAgentAvatar";

type Props = {
  preset: MarketplaceAgentPreset;
  recruited: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onRecruit: () => void;
};

export default function MarketplaceAgentCard({
  preset,
  recruited,
  disabled,
  onOpen,
  onRecruit,
}: Props) {
  const displayCategory = getDisplayCategory(preset);
  const priceLabel = getPriceLabel(preset);
  const tags = (preset.skillTags.length > 0 ? preset.skillTags : preset.departmentRoles).slice(0, 2);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex h-full cursor-pointer flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300"
    >
      <div className="flex gap-3">
        <MarketplaceAgentAvatar preset={preset} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{preset.name}</h3>
            {recruited ? <span className="shrink-0 text-[11px] text-gray-400">已招募</span> : null}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {displayCategory} · {getAgentCategoryLabel(preset.agentCategory)}
          </p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 flex-1 text-xs leading-relaxed text-gray-500">
        {preset.description ?? preset.expertise ?? "暂无描述"}
      </p>

      {tags.length > 0 ? (
        <p className="mt-3 truncate text-[11px] text-gray-400">{tags.join(" · ")}</p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <p className="min-w-0 truncate text-[11px] text-gray-400">
          {preset.boundModelName ?? "默认模型"}
          {priceLabel ? ` · ${priceLabel}` : ""}
        </p>
        {!recruited ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRecruit();
            }}
            disabled={disabled}
            className="shrink-0 rounded-lg bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2d5a8e] disabled:opacity-50"
          >
            招募
          </button>
        ) : null}
      </div>
    </article>
  );
}
